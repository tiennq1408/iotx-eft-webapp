#!/usr/bin/env bash
# B2 — thang bậc kết nối thiết bị (tìm trần 1 triệu). Cũng dùng cho B1-02 (trần một máy phát).
#
# Mỗi bậc chỉ THÊM phần chênh (bậc trước vẫn giữ nguyên) — dựng tải → giữ → đọc số → tăng bậc.
# Dừng ở bậc đầu tiên không đạt (B0). Mỗi IP nguồn một tiến trình emqtt_bench (mục 1.4).
#
#   MQTT_HOST=... MQTT_IFADDR=10.0.0.11,10.0.0.12 ./loadtest/mqtt/bac_ket_noi.sh
#   NHIP_TELEMETRY_S=600 ./loadtest/mqtt/bac_ket_noi.sh        # giữ kết nối + gửi telemetry thật
#
#   BAC        mặc định "1000 10000 50000 100000 250000 500000 1000000"
#   GIU        giây giữ mỗi bậc, mặc định 300;  GIU_LON giây cho bậc ≥ 100.000, mặc định 900
#   NGUONG_NOI tỉ lệ nối được tối thiểu, mặc định 99.9 (B-SLA)
#   TEN_BAI    tên thư mục kết quả, mặc định b2
#
# Đo phía máy phát: tỉ lệ nối được, tốc độ dựng, số bị ngắt giữa bài (số đang giữ tụt xuống).
# Thời gian bắt tay p50/p95/p99: emqtt-bench in tốc độ chứ không in phân vị ở mọi bản — bản
# mới có --prometheus (histogram); không có thì lấy ở B1-01 và phía broker. Phía MÁY CHỦ (CPU,
# RAM, fd, số kết nối mỗi nút, GC) phải ghi song song — B10 quy tắc 4.
# Nhịp: tài liệu câu 1–2 — keepalive mặc định ESP-IDF 120 s, AIOTEC gửi ~10 phút/vòng; bộ giả
# lập 3 s KHÔNG đại diện. Hỏi firmware rồi đặt MQTT_KEEPALIVE / NHIP_TELEMETRY_S.

. "$(dirname "$0")/chung.sh"
BAC=${BAC:-"1000 10000 50000 100000 250000 500000 1000000"}
GIU=${GIU:-300}
GIU_LON=${GIU_LON:-900}
NGUONG_NOI=${NGUONG_NOI:-99.9}
TEN_BAI=${TEN_BAI:-b2}

can_may_chu; can_cong_cu; khong_chong_bai
CUOI=$(echo "$BAC" | awk '{print $NF}')
xac_nhan "$TEN_BAI: thang bậc $BAC kết nối, keepalive $MQTT_KEEPALIVE s, telemetry ${NHIP_TELEMETRY_S}s"
kiem_may_phat "$CUOI"
mo_thu_muc_kq "$TEN_BAI"
trap dung_het EXIT
echo "bac,dung_giay,giu_giay,dang_giu_dau,dang_giu_cuoi,thap_nhat_khi_giu,loi_noi,ti_le_noi,dat" > "$KQ/bac.csv"

TRUOC=0; SO_IP=$(so_ip_nguon); CUOI_DAT="chưa có"
KHOANG=$(( 1000 / TOC_DO_NOI )); [ "$KHOANG" -lt 1 ] && KHOANG=1
for N in $BAC; do
  THEM=$(( N - TRUOC ))
  [ "$THEM" -le 0 ] && continue
  bao "=== bậc $N: thêm $THEM kết nối qua $SO_IP IP nguồn, ${TOC_DO_NOI}/s mỗi tiến trình ==="
  echo "$(date +%s),bac_$N,bat_dau_bac,$N,," >> "$KQ/su_kien.csv"
  T0=$(date +%s); MOI=$(( (THEM + SO_IP - 1) / SO_IP )); DAU=$TRUOC
  for i in $(seq 0 $(( SO_IP - 1 ))); do
    n=$MOI; [ $(( DAU + n )) -gt "$N" ] && n=$(( N - DAU ))
    [ "$n" -le 0 ] && break
    chay_nhom "k${N}_ip$i" "$n" "$DAU" "$KHOANG" "$i"
    DAU=$(( DAU + n ))
  done
  # Đợi dựng xong: thời gian lý thuyết + 2 phút biên.
  HET=$(( T0 + MOI / TOC_DO_NOI + 120 ))
  while [ "$(date +%s)" -lt "$HET" ] && [ "$(dem_da_noi k)" -lt "$N" ]; do sleep 5; done
  T1=$(date +%s); DAU_GIU=$(dem_da_noi k)
  bao "dựng xong sau $(( T1 - T0 )) s: đang giữ $DAU_GIU/$N"
  G=$GIU; [ "$N" -ge 100000 ] && G=$GIU_LON
  THAP=$DAU_GIU; HET=$(( T1 + G ))
  while [ "$(date +%s)" -lt "$HET" ]; do
    sleep 10
    # Số "total" của emqtt-bench là đếm luỹ kế lần nối được; bị ngắt thì phải đọc thêm dòng
    # connect_fail / disconnected. Ghi cả hai để đối chiếu với số kết nối broker báo.
    d=$(dem_da_noi k); [ "$d" -lt "$THAP" ] && THAP=$d
    echo "$(date +%s),bac_$N,mau,$d,," >> "$KQ/su_kien.csv"
  done
  CUOI_GIU=$(dem_da_noi k); LOI=$(dem_loi_noi k)
  TL=$(awk -v a="$CUOI_GIU" -v b="$N" 'BEGIN { printf "%.3f", 100 * a / b }')
  DAT=$(awk -v t="$TL" -v n="$NGUONG_NOI" 'BEGIN { print (t >= n) ? "dat" : "khong" }')
  echo "$N,$(( T1 - T0 )),$G,$DAU_GIU,$CUOI_GIU,$THAP,$LOI,$TL,$DAT" >> "$KQ/bac.csv"
  bao "bậc $N: nối được $TL% (ngưỡng $NGUONG_NOI%), lỗi nối $LOI → $DAT"
  if [ "$DAT" != "dat" ]; then
    bao "Dừng thang ở bậc $N (B0). Ghi TRIỆU CHỨNG: hết RAM? hết fd? CPU bắt tay? một nút lệch tải?"
    break
  fi
  CUOI_DAT=$N; TRUOC=$N
done
bao "BẬC CAO NHẤT CÒN ĐẠT (phía máy phát): $CUOI_DAT. Đối chiếu số kết nối broker báo trước khi kết luận."
bao "Nhớ dọn danh tính/chứng thư sau bài (B10 quy tắc 8)."
