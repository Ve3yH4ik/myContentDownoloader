import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import net from "node:net";
export async function fixture() {
  let retries = 0;
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url!, "http://local").pathname;
    if(path==='/boundary'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(new URL('./boundary.html',import.meta.url)));return;}
    if (path === "/gzip") {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Encoding", "gzip");
      res.end(gzipSync("compressed ".repeat(100)));
      return;
    }
    if (path === "/slow") return;
    if (path === "/read-slow") {
      res.writeHead(200);
      res.write("x");
      return;
    }
    if (path === "/retry") {
      if (++retries % 3 !== 0) {
        res.writeHead(503);
        res.end("retry");
        return;
      }
      res.end("ok");
      return;
    }
    if (path === "/cookie") {
      res.writeHead(302, {
        "Set-Cookie": "session=fixture; Path=/; HttpOnly",
        Location: "/echo",
      });
      res.end();
      return;
    }
    if (path === "/redirect") {
      res.writeHead(302, { Location: "/html" });
      res.end();
      return;
    }
    if (path === "/loop") {
      res.writeHead(302, { Location: "/loop" });
      res.end();
      return;
    }
    if (path === "/error") {
      res.writeHead(418);
      res.end("teapot");
      return;
    }
    if (path === "/binary") {
      res.setHeader("Content-Type", "application/octet-stream");
      res.end(Buffer.from([0, 255, 100, 0]));
      return;
    }
    if (path === "/large") {
      res.end("x".repeat(10000));
      return;
    }
    if (path === "/echo") {
      let body = "";
      for await (const chunk of req) body += chunk;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ method: req.method, headers: req.headers, body }),
      );
      return;
    }
    if (path === "/api") {
      res.setHeader("Content-Type", "application/json");
      res.end('{"value":"live"}');
      return;
    }
    if (path === "/dynamic") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<!doctype html><title>Browser fixture</title><body><input id="name"><input id="password" type="password"><select id="choice"><option>A</option><option>B</option></select><input id="check" type="checkbox"><button id="submit">Submit</button><div id="result"></div><div style="height:2000px"></div><script>document.querySelector('#submit').onclick=async()=>{const r=await fetch('/api');document.querySelector('#result').textContent=document.querySelector('#name').value+' '+(await r.json()).value};setTimeout(()=>{const p=document.createElement('p');p.id='dynamic';p.textContent='ready';document.body.prepend(p)},100)</script></body>`,
      );
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      "<title>Fixture</title><article><h2>Product</h2><price>25 UAH</price></article>",
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as net.AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
export async function httpProxy(auth = false, secure = false) {
  let hits = 0;
  const handler: http.RequestListener = (req, res) => {
    if (
      auth &&
      req.headers["proxy-authorization"] !==
        "Basic " + Buffer.from("user:pass").toString("base64")
    ) {
      res.writeHead(407);
      res.end();
      return;
    }
    hits++;
    const headers = { ...req.headers };
    delete headers["proxy-authorization"];
    const upstream = http.request(
      req.url!,
      { method: req.method, headers },
      (r) => {
        res.writeHead(r.statusCode ?? 500, r.headers);
        r.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  };
  const server = secure
    ? https.createServer(
        {
          cert: readFileSync(new URL("./tls/localhost.crt", import.meta.url)),
          key: readFileSync(new URL("./tls/localhost.key", import.meta.url)),
        },
        handler,
      )
    : http.createServer(handler);
  server.on("connect", (request, socket, head) => {
    const url = new URL(`http://${request.url}`);
    const upstream = net.connect(Number(url.port) || 443, url.hostname, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    socket.on("close", () => upstream.destroy());
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `${secure ? "https" : "http"}://${auth ? "user:pass@" : ""}127.0.0.1:${(server.address() as net.AddressInfo).port}`,
    hits: () => hits,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
export async function socksProxy(version: 4 | 5, auth = false) {
  let hits = 0;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    let stage = version === 4 ? "connect4" : "greeting";
    let buffer = Buffer.alloc(0);
    const data = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === "greeting") {
        if (buffer.length < 2 + buffer[1]) return;
        buffer = buffer.subarray(2 + buffer[1]);
        socket.write(Buffer.from([5, auth ? 2 : 0]));
        stage = auth ? "auth" : "connect5";
      }
      if (stage === "auth") {
        if (buffer.length < 2) return;
        const u = buffer[1];
        if (buffer.length < 3 + u) return;
        const p = buffer[2 + u];
        if (buffer.length < 3 + u + p) return;
        const ok =
          buffer.subarray(2, 2 + u).toString() === "user" &&
          buffer.subarray(3 + u, 3 + u + p).toString() === "pass";
        buffer = buffer.subarray(3 + u + p);
        socket.write(Buffer.from([1, ok ? 0 : 1]));
        if (!ok) {
          socket.end();
          return;
        }
        stage = "connect5";
      }
      let host = "";
      let port = 0;
      let consumed = 0;
      if (stage === "connect4") {
        if (buffer.length < 9) return;
        const end = buffer.indexOf(0, 8);
        if (end < 0) return;
        port = buffer.readUInt16BE(2);
        host = [...buffer.subarray(4, 8)].join(".");
        consumed = end + 1;
        if (host.startsWith("0.0.0.")) {
          const domainEnd = buffer.indexOf(0, consumed);
          if (domainEnd < 0) return;
          host = buffer.subarray(consumed, domainEnd).toString();
          consumed = domainEnd + 1;
        }
      }
      if (stage === "connect5") {
        if (buffer.length < 4) return;
        const type = buffer[3];
        if (type === 1) {
          if (buffer.length < 10) return;
          host = [...buffer.subarray(4, 8)].join(".");
          port = buffer.readUInt16BE(8);
          consumed = 10;
        } else if (type === 3) {
          if (buffer.length < 5 + buffer[4] + 2) return;
          host = buffer.subarray(5, 5 + buffer[4]).toString();
          port = buffer.readUInt16BE(5 + buffer[4]);
          consumed = 7 + buffer[4];
        } else {
          socket.destroy();
          return;
        }
      }
      if (!consumed) return;
      stage = "tunnel";
      socket.removeListener("data", data);
      const upstream = net.connect(port, host, () => {
        hits++;
        socket.write(
          version === 4
            ? Buffer.from([0, 90, 0, 0, 0, 0, 0, 0])
            : Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]),
        );
        if (buffer.length > consumed) upstream.write(buffer.subarray(consumed));
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      sockets.add(upstream);
      upstream.on("error", () => socket.destroy());
      upstream.on("close", () => sockets.delete(upstream));
      socket.on("close", () => upstream.destroy());
    };
    socket.on("data", data);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `socks${version}://${auth ? "user:pass@" : ""}127.0.0.1:${(server.address() as net.AddressInfo).port}`,
    hits: () => hits,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
