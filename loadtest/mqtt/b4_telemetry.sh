#!/usr/bin/env bash
# B4 — telemetry khi đã đầy tải: giữ NEN kết nối (bậc cao nhất B2 còn đạt) và tăng nhịp gửi
# 60 s → 30 s → 10 s → 5 s. Đo thông điệp/giây broker nhận được so với lý thuyết NEN ÷ nhịp.
#
#   MQTT_HOST=... NEN=100000 MQTT_IFADDR=... ./loadtest/mqtt/b4_telemetry.sh
#   NHIP="600 60 30 10 5"  GIU=300  (600 = nhịp mạch AIOTEC thật ~10 phút, câu 2)
#
# emqtt-bench KHÔNG đổi được nhịp gửi khi đang chạy, nên mỗi nhịp là một lượt: dựng NEN kết nối
# CHẬM (TOC_DO_NOI) để không thành bão nối lại, đợi đủ, giữ GIU giây, dừng, nghỉ NGHI giây.
# Phía máy phát chỉ cho ra số đã GỬI (dòng "pub" trong log). Số broker NHẬN, độ trễ mạch gửi →
# `lastValues` đổi (B-SLA p95 ≤ 5 s) và tỉ lệ mất bản ghi phải đo phía ThingsBoard/IBS — bài này
# là bài làm lộ đoạn ThingsBoard → IBS (mục 1.3: REST từng bản tin, 1 tiến trình Node, pool 10).

. "$(dirname "$0")/chung.sh"
NEN=${NEN:-10000}
NHIP=${NHIP:-"60 30 10 5"}
GIU=${GIU:-300}
NGHI=${NGHI:-120}

can_may_chu; can_cong_cu; khong_chong_bai
xac_nhan "B4: $NEN thiết bị gửi telemetry theo nhịp $NHIP giây"
kiem_may_phat "$NEN"
mo_thu_muc_kq b4
trap dung_het EXIT
echo "nhip_s,ket_noi,ly_thuyet_msg_s,da_gui_msg_s,ti_le" > "$KQ/telemetry.csv"
SO_IP=$(so_ip_nguon)
KHOANG=$(( 1000 / TOC_DO_NOI )); [ "$KHOANG" -lt 1 ] && KHOANG=1

dem_da_gui() {  # tổng số bản tin đã gửi, từ dòng "pub ... total=N" mới nhất của mỗi log
  local tong=0 f so
  for f in "$KQ"/"$1"*.log; do
    so=$(grep -Eo 'pub[^,]*total=[0-9]+' "$f" | tail -1 | grep -Eo '[0-9]+$')
    tong=$(( tong + ${so:-0} ))
  done
  echo "$tong"
}

for N in $NHIP; do
  NHIP_TELEMETRY_S=$N
  bao "=== nhịp $N s: dựng $NEN kết nối ==="
  MOI=$(( (NEN + SO_IP - 1) / SO_IP )); DAU=0
  for i in $(seq 0 $(( SO_IP - 1 ))); do
    n=$MOI; [ $(( DAU + n )) -gt "$NEN" ] && n=$(( NEN - DAU ))
    [ "$n" -le 0 ] && break
    chay_nhom "n${N}_ip$i" "$n" "$DAU" "$KHOANG" "$i"
    DAU=$(( DAU + n ))
  done
  HET=$(( $(date +%s) + MOI / TOC_DO_NOI + 120 ))
  while [ "$(date +%s)" -lt "$HET" ] && [ "$(dem_da_noi "n${N}_")" -lt "$NEN" ]; do sleep 5; done
  # Đợi một nhịp cho mọi mạch vào guồng, rồi mới đếm.
  sleep "$N"
  G0=$(dem_da_gui "n${N}_"); T0=$(date +%s)
  echo "$T0,nhip_$N,bat_dau_do,$(dem_da_noi "n${N}_"),," >> "$KQ/su_kien.csv"
  sleep "$GIU"
  G1=$(dem_da_gui "n${N}_"); T1=$(date +%s)
  echo "$T1,nhip_$N,het_do,$(dem_da_noi "n${N}_"),," >> "$KQ/su_kien.csv"
  LT=$(awk -v a="$NEN" -v b="$N" 'BEGIN { printf "%.1f", a / b }')
  THAT=$(awk -v a="$G0" -v b="$G1" -v t=$(( T1 - T0 )) 'BEGIN { printf "%.1f", (b - a) / t }')
  TL=$(awk -v a="$THAT" -v b="$LT" 'BEGIN { printf "%.1f", 100 * a / b }')
  echo "$N,$(dem_da_noi "n${N}_"),$LT,$THAT,$TL" >> "$KQ/telemetry.csv"
  bao "nhịp $N s: lý thuyết $LT bản tin/s, máy phát gửi $THAT/s ($TL%). Đối chiếu số broker NHẬN trong cùng mốc."
  dung_het
  bao "nghỉ $NGHI s"; sleep "$NGHI"
done
bao "Xong. $KQ/telemetry.csv + su_kien.csv (mốc đo) — ghép với số TB nhận, độ trễ lastValues, CPU IBS."
