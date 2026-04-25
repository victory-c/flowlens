import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "*": [
      "./OECD Dataset.xlsx - complete_p4d3_df.csv",
      "./OECD Dataset.xlsx - Legenda.csv",
      "./data/raw/**",
      "./data/processed/**"
    ]
  }
};

export default nextConfig;
