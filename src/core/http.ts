import http from "node:http";
import https from "node:https";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { CookieJar } from "tough-cookie";
import iconv from "iconv-lite";
import {
  requestProfileSchema,
  redactUrl,
  safeHeaders,
  type RequestProfile,
  type ResolvedSecrets,
  type HttpResult,
} from "./request-profile";
function proxyAgent(proxy: string, url: string, ca?: string) {
  const protocol = new URL(proxy).protocol;
  return protocol.startsWith("socks")
    ? new SocksProxyAgent(proxy)
    : url.startsWith("https:")
      ? new HttpsProxyAgent(proxy, { ca })
      : new HttpProxyAgent(proxy, { ca });
}
async function once(
  profile: RequestProfile,
  url: string,
  method: string,
  body: string,
  headers: Record<string, string>,
  secrets: ResolvedSecrets,
  signal: AbortSignal,
): Promise<{
  status: number;
  headers: Record<string, string>;
  rawHeaders: http.IncomingHttpHeaders;
  body: Buffer;
}> {
  const agent = secrets.proxyUrl
    ? proxyAgent(secrets.proxyUrl, url, secrets.ca)
    : undefined;
  return new Promise((resolve, reject) => {
    const transport = url.startsWith("https:") ? https : http;
    const request = transport.request(
      url,
      { method, headers, agent, signal, ca: secrets.ca },
      (response) => {
        clearTimeout(connectTimer);
        const chunks: Buffer[] = [];
        let size = 0;
        response.setTimeout(profile.readTimeoutMs, () =>
          request.destroy(new Error("Read timeout")),
        );
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > profile.maxBytes) {
            reject(new Error("Response size limit exceeded"));
            response.destroy();
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: Object.fromEntries(
              Object.entries(response.headers).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(", ") : String(v ?? ""),
              ]),
            ),
            rawHeaders: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    const connectTimer = setTimeout(
      () => request.destroy(new Error("Connect/headers timeout")),
      profile.connectTimeoutMs,
    );
    request.on("error", reject);
    request.on("close", () => {
      clearTimeout(connectTimer);
      agent?.destroy();
    });
    if (body && method !== "GET") request.write(body);
    request.end();
  });
}
export async function httpRequest(
  input: unknown,
  secrets: ResolvedSecrets = {},
  signal?: AbortSignal,
): Promise<HttpResult> {
  const profile = requestProfileSchema.parse(input);
  if(profile.headerSecretId&&!secrets.headers||profile.cookieSecretId&&!secrets.cookie||profile.bodySecretId&&secrets.body===undefined||profile.proxyId&&!secrets.proxyUrl)throw new Error('RequestProfile requires resolved secrets/proxy; direct fallback is disabled');
  const start = performance.now();
  const abort = AbortSignal.any([
    AbortSignal.timeout(profile.totalTimeoutMs),
    ...(signal ? [signal] : []),
  ]);
  const jar = new CookieJar();
  if (secrets.cookie)
    for (const item of secrets.cookie.split(";")) {
      const value = item.trim();
      if (value) await jar.setCookie(value, profile.url);
    }
  const log: string[] = [];
  const mayRetry =
    ["GET", "PUT", "DELETE"].includes(profile.method) || profile.retryUnsafe;
  for (let attempt = 0; attempt <= profile.retries; attempt++) {
    try {
      let url = profile.url;
      let method: string = profile.method;
      let body = secrets.body ?? profile.body;
      let headers: Record<string, string> = {
        "user-agent": profile.userAgent,
        "accept-encoding": "identity",
        ...profile.headers,
        ...secrets.headers,
      };
      const redirects: string[] = [];
      let response: Awaited<ReturnType<typeof once>>;
      for (let hop = 0; ; hop++) {
        const cookie = await jar.getCookieString(url);
        const outgoing = {
          ...headers,
          ...(cookie ? { cookie } : {}),
          ...(body && method !== "GET"
            ? { "content-length": String(Buffer.byteLength(body)) }
            : {}),
        };
        response = await once(
          profile,
          url,
          method,
          body,
          outgoing,
          secrets,
          abort,
        );
        for (const value of response.rawHeaders["set-cookie"] ?? [])
          await jar.setCookie(value, url).catch(() => {});
        if (
          !profile.followRedirects ||
          ![301, 302, 303, 307, 308].includes(response.status) ||
          !response.headers.location
        )
          break;
        if (hop >= profile.maxRedirects)
          throw new Error("Redirect limit exceeded");
        const next = requestProfileSchema.parse({
          ...profile,
          url: new URL(response.headers.location, url).href,
        }).url;
        if (new URL(next).origin !== new URL(url).origin)
          headers = Object.fromEntries(
            Object.entries(headers).filter(
              ([k]) =>
                !/authorization|cookie|token|secret|api[-_]?key/i.test(k),
            ),
          );
        if (
          response.status === 303 ||
          ([301, 302].includes(response.status) && method === "POST")
        ) {
          method = "GET";
          body = "";
          headers = Object.fromEntries(
            Object.entries(headers).filter(([k]) => !/^content-/i.test(k)),
          );
        }
        url = next;
        redirects.push(redactUrl(url));
      }
      if (
        [408, 429, 500, 502, 503, 504].includes(response.status) &&
        mayRetry &&
        attempt < profile.retries
      )
        throw new Error(`Retryable HTTP ${response.status}`);
      const compression = response.headers["content-encoding"];
      const limit = { maxOutputLength: profile.maxBytes };
      if (compression === "gzip")
        response.body = gunzipSync(response.body, limit);
      else if (compression === "deflate")
        response.body = inflateSync(response.body, limit);
      else if (compression === "br")
        response.body = brotliDecompressSync(response.body, limit);
      const contentType = response.headers["content-type"] ?? "";
      const binary =
        !/text|json|xml|javascript|x-www-form-urlencoded/i.test(contentType) &&
        contentType !== "";
      const declared = /charset\s*=\s*["']?([^;\s"']+)/i.exec(contentType)?.[1];
      const encoding =
        profile.encoding === "auto" ? (declared ?? "utf-8") : profile.encoding;
      if (!binary && !iconv.encodingExists(encoding))
        throw new Error(`Unsupported encoding: ${encoding}`);
      log.push(
        `${method} ${redactUrl(url)} → HTTP ${response.status}; ${response.body.length} bytes; attempt ${attempt + 1}`,
      );
      return {
        url: redactUrl(url),
        status: response.status,
        headers: safeHeaders(response.headers),
        bodyBase64: response.body.toString("base64"),
        text: binary ? "" : iconv.decode(response.body, encoding),
        binary,
        bytes: response.body.length,
        durationMs: performance.now() - start,
        attempts: attempt + 1,
        redirects,
        log,
      };
    } catch (error) {
      if (abort.aborted) throw new Error("Request cancelled or total timeout");
      if (!mayRetry || attempt === profile.retries) throw error;
      log.push(`Attempt ${attempt + 1} failed; retry scheduled`);
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          clearTimeout(timer);
          abort.removeEventListener("abort", cancel);
        };
        const cancel = () => {
          done();
          reject(new Error("Request cancelled"));
        };
        const timer = setTimeout(
          () => {
            done();
            resolve();
          },
          profile.backoffMs * 2 ** attempt,
        );
        abort.addEventListener("abort", cancel, { once: true });
      });
    }
  }
  throw new Error("Retry exhausted");
}
