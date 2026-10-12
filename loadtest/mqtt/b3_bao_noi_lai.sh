#!/usr/bin/env bash
# B3 — bão nối lại thiết bị. Hai biến thể BẮT BUỘC chạy cả hai:
#
#   ./loadtest/mqtt/b3_bao_noi_lai.sh a     B3-a: nối lại NGAY LẬP TỨC, mọi nhóm cùng lúc
#   ./loadtest/mqtt/b3_bao_noi_lai.sh b     B3-b: nối lại có chờ ngẫu nhiên (jitter) 0..JITTER_S
#
# Mỗi bậc (BAC, mặc định "1000 10000 50000 100000"): dựng đủ N kết nối (chậm, theo TOC_DO_NOI),
# giữ ổn định ON_DINH giây (mặc định 300), CẮT SẠCH cùng lúc, rồi nối lại CÙNG clientId (broker
# phải xử lý chiếm phiên — session takeover). Đo: bao lâu nối lại hết · bao nhiêu không nối lại
# được · ghi mốc epoch để đọc đỉnh CPU / số bắt tay mỗi giây phía broker.
# Ngưỡng đề xuất: 100% nối lại trong ≤ 120 s (NGUONG_S). Không đạt thì dừng thang.
#
# Chia N kết nối thành NHOM tiến trình (mặc định 20). emqtt-bench KHÔNG có backoff + jitter,
# nên B3-b làm xấp xỉ: mỗi NHÓM khởi động lệch một khoảng ngẫu nhiên đều trong 0..JITTER_S
# (mặc định 60 — phải nhỏ hơn ngưỡng 120 s, tài liệu B3), trong nhóm nối rải theo TOC_DO_NOI.
# Độ mịn jitter = một nhóm; muốn mịn hơn thì tăng NHOM. Phần "tăng dần khi thất bại" không mô
# phỏng được — lần nối hỏng trong emqtt-bench chỉ thử lại theo --num-retry-connect (nếu bản
# đang cài có cờ đó, đặt THU_LAI=n). Ghi rõ đây là xấp xỉ khi báo cáo.
#
# Cách cắt (CACH_CAT):
#   giet     (mặc định) kill -9 tiến trình máy phát. LƯU Ý: nhân hệ điều hành vẫn gửi FIN/RST
#            nên broker BIẾT ngay phiên cũ đã chết — KHÔNG giống "mất mạng phía khách hàng"
#            như bảng trong tài liệu B3 mô tả.
#   im_lang  giống mất mạng thật: chặn gói FIN/RST đi ra tới broker (iptables, cần root, Linux)
#            rồi mới kill -9 — broker không biết phiên cũ chết cho tới khi hết keepalive × 1,5,
#            và lần nối lại cùng clientId kích hoạt chiếm phiên. Luật iptables được gỡ khi xong bậc.
#   Khởi động lại nút broker / bộ cân tải là việc của hạ tầng — script chỉ ghi mốc, đợi bạn
#   bấm Enter (CACH_CAT=tay).

. "$(dirname "$0")/chung.sh"
BIEN=${1:-}
case "$BIEN" in a|b) ;; *) echo "Dùng: $0 a|b"; exit 1 ;; esac
BAC=${BAC:-"1000 10000 50000 100000"}
ON_DINH=${ON_DINH:-300}
NHOM=${NHOM:-20}
JITTER_S=${JITTER_S:-60}
NGUONG_S=${NGUONG_S:-120}
CACH_CAT=${CACH_CAT:-giet}
THU_LAI=${THU_LAI:-0}

can_may_chu; can_cong_cu; khong_chong_bai
if [ "$CACH_CAT" = "im_lang" ]; then
  [ "$(uname)" = "Linux" ] && [ "$(id -u)" = "0" ] && command -v iptables >/dev/null || {
    echo "CACH_CAT=im_lang cần Linux + root + iptables."; exit 2; }
  IP_DICH=$(getent ahostsv4 "$MQTT_HOST" | awk 'NR==1 {print $1}')
fi
CUOI=$(echo "$BAC" | awk '{print $NF}')
xac_nhan "B3-$BIEN: bão nối lại $BAC thiết bị, cắt bằng $CACH_CAT"
kiem_may_phat "$CUOI"
mo_thu_muc_kq "b3$BIEN"
go_luat() {
  [ "$CACH_CAT" = "im_lang" ] || return 0
  iptables -D OUTPUT -p tcp -d "$IP_DICH" --dport "$MQTT_PORT" --tcp-flags FIN FIN -j DROP 2>/dev/null
  iptables -D OUTPUT -p tcp -d "$IP_DICH" --dport "$MQTT_PORT" --tcp-flags RST RST -j DROP 2>/dev/null
}
trap 'dung_het; go_luat' EXIT
echo "bac,bien_the,cach_cat,hoi_phuc_giay,noi_lai_duoc,khong_noi_lai,dat" > "$KQ/bao.csv"
KHOANG=$(( 1000 / TOC_DO_NOI )); [ "$KHOANG" -lt 1 ] && KHOANG=1
CO_THU_LAI=()
if [ "$THU_LAI" -gt 0 ]; then
  if co_co --num-retry-connect; then CO_THU_LAI=(--num-retry-connect "$THU_LAI")
  else bao "Bản emqtt-bench này không có --num-retry-connect — bỏ THU_LAI."; fi
fi

dung_nhom() {  # dung_nhom <tiền tố nhãn> <N> <khoảng ms> <có jitter 0/1>
  local tt=$1 N=$2 kh=$3 jit=$4 moi g dau n tre
  moi=$(( (N + NHOM - 1) / NHOM ))
  for g in $(seq 0 $(( NHOM - 1 ))); do
    dau=$(( g * moi )); n=$moi; [ $(( dau + n )) -gt "$N" ] && n=$(( N - dau ))
    [ "$n" -le 0 ] && break
    if [ "$jit" = "1" ]; then
      tre=$(awk -v j="$JITTER_S" -v s="$RANDOM$g" 'BEGIN { srand(s); printf "%.1f", rand() * j }')
      # không chặn: nhóm này khởi động sau $tre giây
      chay_nhom_tre "$tre" "$tt$g" "$n" "$dau" "$kh" "$g" ${CO_THU_LAI[@]+"${CO_THU_LAI[@]}"}
    else
      chay_nhom "$tt$g" "$n" "$dau" "$kh" "$g" ${CO_THU_LAI[@]+"${CO_THU_LAI[@]}"}
    fi
  done
}

CUOI_DAT="chưa có"
for N in $BAC; do
  bao "=== bậc $N: dựng $NHOM nhóm, giữ $ON_DINH s ==="
  dung_nhom "dung${N}_" "$N" "$KHOANG" 0
  HET=$(( $(date +%s) + N / NHOM / TOC_DO_NOI + 180 ))
  while [ "$(date +%s)" -lt "$HET" ] && [ "$(dem_da_noi "dung${N}_")" -lt "$N" ]; do sleep 5; done
  bao "đang giữ $(dem_da_noi "dung${N}_")/$N — ổn định $ON_DINH s"
  sleep "$ON_DINH"

  if [ "$CACH_CAT" = "im_lang" ]; then
    iptables -I OUTPUT -p tcp -d "$IP_DICH" --dport "$MQTT_PORT" --tcp-flags FIN FIN -j DROP
    iptables -I OUTPUT -p tcp -d "$IP_DICH" --dport "$MQTT_PORT" --tcp-flags RST RST -j DROP
  elif [ "$CACH_CAT" = "tay" ]; then
    printf "Khởi động lại nút broker / bộ cân tải NGAY BÂY GIỜ rồi bấm Enter: "; read -r _
  fi
  T_CAT=$(date +%s)
  echo "$T_CAT,bac_$N,CAT,$N,," >> "$KQ/su_kien.csv"
  [ "$CACH_CAT" != "tay" ] && dung_het
  bao "ĐÃ CẮT lúc $T_CAT — nối lại kiểu B3-$BIEN"
  if [ "$BIEN" = "a" ]; then dung_nhom "lai${N}_" "$N" 1 0; else dung_nhom "lai${N}_" "$N" "$KHOANG" 1; fi

  HOI=""; HET=$(( T_CAT + 600 ))
  while [ "$(date +%s)" -lt "$HET" ]; do
    sleep 1
    d=$(dem_da_noi "lai${N}_")
    echo "$(date +%s),bac_$N,mau_noi_lai,$d,," >> "$KQ/su_kien.csv"
    if [ "$d" -ge "$N" ]; then HOI=$(( $(date +%s) - T_CAT )); break; fi
  done
  d=$(dem_da_noi "lai${N}_")
  DAT=khong; [ -n "$HOI" ] && [ "$HOI" -le "$NGUONG_S" ] && DAT=dat
  echo "$N,$BIEN,$CACH_CAT,${HOI:-qua_600},$d,$(( N - d )),$DAT" >> "$KQ/bao.csv"
  bao "bậc $N: nối lại $d/$N sau ${HOI:-> 600} s (ngưỡng $NGUONG_S s) → $DAT"
  dung_het; go_luat
  [ "$DAT" = "dat" ] || { bao "Dừng thang ở bậc $N (B0)."; break; }
  CUOI_DAT=$N
  [ "$N" = "$CUOI" ] && break
  bao "nghỉ 120 s cho broker hồi trước bậc sau"; sleep 120
done
bao "B3-$BIEN — bậc cao nhất còn đạt: $CUOI_DAT. So B3-a với B3-b: B3-a gãy mà B3-b đạt ⇒ firmware PHẢI có backoff + jitter."
bao "Mất telemetry trong bão: đối chiếu phía TB/IBS (bộ này không đo). Dọn danh tính sau bài (B10 quy tắc 8)."
