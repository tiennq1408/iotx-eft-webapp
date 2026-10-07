#!/usr/bin/env bash
# Đưa Livotec Home lên Cloud Run.
#
#   ./trien-khai-cloudrun.sh                      # dùng project đang đặt trong gcloud
#   DU_AN=iotx-dev ./trien-khai-cloudrun.sh       # chỉ định project
#
# Lần đầu chạy, gcloud sẽ hỏi bật Cloud Build + Artifact Registry API — trả lời `y`.
# Nó đọc Dockerfile ở thư mục này, build trên Cloud Build rồi chạy ảnh đó.
set -euo pipefail

TEN=${TEN:-livotec-home}
VUNG=${VUNG:-asia-southeast1}          # Singapore — gần VN nhất, cùng vùng Artifact Registry của EFT
UPSTREAM=${UPSTREAM:-https://api.dev.happibot.net}
DU_AN=${DU_AN:-$(gcloud config get-value project 2>/dev/null)}

[ -n "$DU_AN" ] && [ "$DU_AN" != "(unset)" ] || {
  echo "Chưa biết project. Chạy: gcloud config set project <ten-project>  (hoặc đặt DU_AN=...)" >&2
  exit 1
}

echo "→ $TEN · project $DU_AN · vùng $VUNG · API $UPSTREAM"

gcloud run deploy "$TEN" \
  --source . \
  --project "$DU_AN" \
  --region "$VUNG" \
  --allow-unauthenticated \
  --port 3000 \
  --cpu 1 --memory 512Mi \
  --set-env-vars "IOTX_API_UPSTREAM=$UPSTREAM" \
  --timeout 3600 \
  --min-instances 1

# --port 3000       khớp EXPOSE trong Dockerfile; Cloud Run đặt luôn PORT=3000 cho container
# --timeout 3600    app dùng SSE (/v1/stream) để thiết bị đổi trạng thái là hiện ngay. Mặc định
#                   Cloud Run cắt request ở 300s, kết nối SSE sẽ đứt mỗi 5 phút. 3600 là mức trần.
# --min-instances 1 giữ một bản luôn sẵn, khách bấm link không phải chờ khởi động nguội.
#                   Hết đợt demo thì đổi về 0 cho khỏi tốn: gcloud run services update "$TEN" \
#                   --region "$VUNG" --min-instances 0
# NEXT_PUBLIC_* đã nướng sẵn vào ảnh qua ARG mặc định trong Dockerfile (iotx, /v1, livotec, vi).
# Riêng IOTX_API_UPSTREAM đọc ở từng request nên đổi được bằng --set-env-vars, không cần build lại.

echo
echo "Link gửi khách:"
gcloud run services describe "$TEN" --project "$DU_AN" --region "$VUNG" --format='value(status.url)'
