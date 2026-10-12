#!/usr/bin/env bash
# B1-01 — chi phí MỘT lần bắt tay TLS trên broker. Số đầu vào cho mọi tính toán bão nối lại.
#
# Cách: mở/đóng từng lô SO_MOI_LAN kết nối, LAN lần, nghỉ NGHI giây giữa các lô. Ghi mốc epoch
# đầu/cuối mỗi lô vào su_kien.csv. Ghép với đồ thị CPU broker cùng mốc rồi tính:
#     ms CPU mỗi lần bắt tay ≈ (CPU% trung bình × số lõi × giây của lô × 10) ÷ số kết nối của lô
# (CPU% 0..100 mỗi lõi). Phía máy phát chỉ cho ra tốc độ; CPU phải đo ở BROKER.
#
#   MQTT_HOST=... MQTT_XAC_THUC=mtls MQTT_CERT=... MQTT_KEY=... ./loadtest/mqtt/b1_bat_tay.sh
#   (thêm B1-01b: S_TIME=30 dùng `openssl s_time` đo số lần bắt tay đầy đủ/giây từ MỘT luồng)
#
# Đo ở ĐÚNG chỗ production kết thúc TLS (mục 1.1c). Trên DEV đó là chính ThingsBoard (Java/Netty).
# mTLS ở đây dùng một chứng thư cho mọi kết nối — ổn cho bài này vì chỉ đo chi phí bắt tay,
# nhưng broker sẽ thấy CÙNG một thiết bị nối lại liên tục (chiếm phiên) — ghi chú vào báo cáo.

. "$(dirname "$0")/chung.sh"
SO_MOI_LAN=${SO_MOI_LAN:-1000}
LAN=${LAN:-10}
NGHI=${NGHI:-30}
S_TIME=${S_TIME:-0}

can_may_chu; can_cong_cu; khong_chong_bai
xac_nhan "B1-01: $LAN lô × $SO_MOI_LAN lần bắt tay"
kiem_may_phat "$SO_MOI_LAN"
mo_thu_muc_kq b1_bat_tay
trap dung_het EXIT
echo "lan,bat_dau_epoch,xong_epoch,giay,noi_duoc,loi" > "$KQ/lo.csv"

for lan in $(seq 1 "$LAN"); do
  t0=$(date +%s)
  chay_nhom "lo$lan" "$SO_MOI_LAN" 0 1 0
  het=$(( t0 + 120 ))
  while [ "$(date +%s)" -lt "$het" ] && [ "$(dem_da_noi "lo$lan")" -lt "$SO_MOI_LAN" ]; do sleep 1; done
  t1=$(date +%s); noi=$(dem_da_noi "lo$lan"); loi=$(dem_loi_noi "lo$lan")
  dung_het
  echo "$lan,$t0,$t1,$(( t1 - t0 )),$noi,$loi" >> "$KQ/lo.csv"
  bao "lô $lan: $noi/$SO_MOI_LAN nối được trong $(( t1 - t0 )) s, lỗi $loi"
  sleep "$NGHI"
done

if [ "$S_TIME" -gt 0 ]; then
  bao "B1-01b: openssl s_time $S_TIME giây, bắt tay đầy đủ mỗi lần (-new)…"
  co=()
  [ "$MQTT_XAC_THUC" = "mtls" ] && co=(-cert "${MQTT_CERT}" -key "${MQTT_KEY}")
  [ -n "${MQTT_CA:-}" ] && co+=(-CAfile "$MQTT_CA")
  openssl s_time -connect "$MQTT_HOST:$MQTT_PORT" -new -time "$S_TIME" ${co[@]+"${co[@]}"} 2>&1 | tee "$KQ/s_time.txt" | tail -3
fi
bao "Xong. Ghép $KQ/lo.csv với CPU broker để ra ms CPU mỗi lần bắt tay."
