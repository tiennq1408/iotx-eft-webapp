export const iotxConfig = {
  mode: process.env.NEXT_PUBLIC_IOTX_MODE === "mock" ? "mock" : "iotx",
  apiBase: (process.env.NEXT_PUBLIC_IOTX_API_BASE || "/v1").replace(/\/$/, ""),
  tenant: process.env.NEXT_PUBLIC_IOTX_TENANT || "livotec",
  lang: process.env.NEXT_PUBLIC_IOTX_LANG || "vi",
} as const;

export const isIotxMode = iotxConfig.mode === "iotx";
