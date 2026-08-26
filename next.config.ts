import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 沙箱预览通过 *.dev.coze.site 代理访问（端口嵌在子域名中）。
  // 本机常用 127.0.0.1 或局域网地址打开页面；Next 默认绑 localhost 时它们视为不同源。
  allowedDevOrigins: ["**.dev.coze.site", "127.0.0.1", "192.168.1.7"],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
