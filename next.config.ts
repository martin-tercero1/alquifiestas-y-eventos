import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer renders PDFs with Node-native machinery (fontkit,
  // streams). Bundling it through the server compiler breaks that; keep it
  // external so the comprobante route (Brief 04 §9) can require it at runtime.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
