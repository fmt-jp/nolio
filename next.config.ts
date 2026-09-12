import type { NextConfig } from "next";

// GitHub Pages serves this project from https://<user>.github.io/nolio/,
// so the build needs a basePath — but only when actually building for Pages,
// not for local dev/preview at the root.
const isGithubPages = process.env.GITHUB_PAGES === "true";
const repoName = "nolio";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isGithubPages ? `/${repoName}` : "",
  assetPrefix: isGithubPages ? `/${repoName}/` : "",
};

export default nextConfig;
