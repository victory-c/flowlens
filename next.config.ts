import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "*": [
      "./OECD Dataset.xlsx - complete_p4d3_df.csv",
      "./OECD Dataset.xlsx - Legenda.csv",
      "./data/raw/**",
      "./data/processed/**",
      "./cleaned_data6/**"
    ]
  }
};

export default nextConfig;
