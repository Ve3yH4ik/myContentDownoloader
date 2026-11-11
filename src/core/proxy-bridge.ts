import http from "node:http";
import net from "node:net";
import { SocksClient } from "socks";
import { SocksProxyAgent } from "socks-proxy-agent";
// Chromium cannot authenticate SOCKS itself. Credentials stay in this local bridge.
export async function createSocksBridge(upstream: string) {
  const proxy = new URL(upstream);
  const sockets = new Set<net.Socket>();
  const agent = new SocksProxyAgent(upstream);
  const server = http.createServer((req, res) => {
    const outgoing = http.request(
      req.url!,
      { method: req.method, headers: req.headers, agent },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    outgoing.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(outgoing);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("connect", (request, client, head) => {
    const target = new URL(`http://${request.url}`);
    void SocksClient.createConnection({
      command: "connect",
      timeout: 10000,
      proxy: {
        host: proxy.hostname,
        port: Number(proxy.port),
        type: proxy.protocol === "socks4:" ? 4 : 5,
        userId: decodeURIComponent(proxy.username),
        password: decodeURIComponent(proxy.password),
      },
      destination: { host: target.hostname, port: Number(target.port) || 443 },
    })
      .then(({ socket }) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
        socket.on("error", () => client.destroy());
        client.on("error", () => socket.destroy());
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) socket.write(head);
        client.pipe(socket);
        socket.pipe(client);
      })
      .catch(() => client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server: `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`,
    close: async () => {
      agent.destroy();
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
