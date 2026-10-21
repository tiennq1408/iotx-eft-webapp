export const iotxConfig = {
  mode: process.env.NEXT_PUBLIC_IOTX_MODE === "mock" ? "mock" : "iotx",
  apiBase: (process.env.NEXT_PUBLIC_IOTX_API_BASE || "/v1").replace(/\/$/, ""),
  tenant: process.env.NEXT_PUBLIC_IOTX_TENANT || "livotec",
  // Ngôn ngữ khi người dùng chưa từng chọn: tiếng Anh, như web.dev (yêu cầu 21/10/2026).
  lang: process.env.NEXT_PUBLIC_IOTX_LANG || "en",
} as const;

export const isIotxMode = iotxConfig.mode === "iotx";
