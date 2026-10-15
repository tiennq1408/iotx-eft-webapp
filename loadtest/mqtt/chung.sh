#!/usr/bin/env bash
# Phần dùng chung cho các bài nhánh THIẾT BỊ (B1-01, B1-02, B2, B3, B4) — nạp bằng `. chung.sh`.
#
# Bọc emqtt-bench (https://github.com/emqx/emqtt-bench). KHÔNG tự viết bộ phát MQTT bằng
# Python (tài liệu mục 1.5). Script này KHÔNG tự cài gì — xem README mục "Cài công cụ".
#
# Biến môi trường (không ghi khoá, mật khẩu, token vào tệp nào trong repo):
#   MQTT_HOST          BẮT BUỘC, không có mặc định — để không ai lỡ tay bắn vào DEV
#   MQTT_PORT          mặc định 8883 (MQTT/TLS, ThingsBoard tự kết thúc TLS)
#   MQTT_XAC_THUC      mtls | clientid | token   (mặc định mtls — production là mTLS RSA-2048)
#                        mtls     : -S --certfile/--keyfile. emqtt-bench dùng MỘT chứng thư cho mọi
#                                   kết nối trong MỘT tiến trình ⇒ mọi kết nối của tiến trình đó là
#                                   CÙNG MỘT thiết bị trong ThingsBoard (chiếm phiên của nhau). Chỉ
#                                   đúng cho B1-01 và cho bài chia nhóm nhỏ (mỗi nhóm một chứng thư).
#                        clientid : TLS một phía + mỗi kết nối một clientId riêng (--prefix). Thiết bị
#                                   TB phải có credentials MQTT_BASIC chỉ gồm clientId. Đo được bắt tay
#                                   TLS phía máy chủ nhưng KHÔNG gồm xác minh chứng thư client ⇒ hệ quả
#                                   mục 1.1d: chi phí bắt tay đo ra THẤP HƠN thật (~2 ms thay vì ~4 ms
#                                   mỗi lần theo bảng 1.1c). Ghi rõ điều này vào báo cáo.
#                        token    : -u <access token TB>. Một token = một thiết bị ⇒ chỉ để thử khói.
#   MQTT_CA            CA của broker để kiểm máy chủ (tuỳ chọn; chỉ dùng nếu bản emqtt-bench có --cacertfile)
#   MQTT_CERT, MQTT_KEY   chứng thư + khoá client (mtls). Hoặc MQTT_CHUNG_THU_DIR: mỗi nhóm lấy chứng
#                      thư <TIEN_TO><số đầu nhóm>.crt/.key do tao_chung_thu.sh sinh
#   MQTT_TOKEN         access token (token)
#   MQTT_PREFIX        tiền tố clientId, mặc định lt  ⇒ clientId = serial = CN = lt<số>
#   MQTT_PHIEN_BAN     4 = MQTT 3.1.1 (mặc định, như mạch thật) · 5 = MQTT 5
#   MQTT_KEEPALIVE     giây, mặc định 120 (mặc định ESP-IDF; tài liệu câu 1 — VẪN PHẢI hỏi firmware)
#   NHIP_TELEMETRY_S   0 = chỉ giữ kết nối (conn); >0 = gửi telemetry mỗi N giây (pub)
#   MQTT_TOPIC         mặc định v1/devices/me/telemetry
#   MQTT_PAYLOAD       mặc định {"lt":1}  ·  MQTT_QOS mặc định 1
#   MQTT_IFADDR        danh sách IP nguồn cách nhau dấu phẩy (mỗi IP một tiến trình) — mục 1.4
#   TOC_DO_NOI         kết nối/giây mỗi tiến trình khi dựng tải, mặc định 500

set -u
TD_MQTT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GOC="$(cd "$TD_MQTT/../.." && pwd)"
DAU=${DAU:-$(date +%Y%m%d_%H%M)}

: "${MQTT_PORT:=8883}"
: "${MQTT_XAC_THUC:=mtls}"
: "${MQTT_PREFIX:=lt}"
: "${MQTT_KEEPALIVE:=120}"
: "${MQTT_PHIEN_BAN:=4}"
: "${NHIP_TELEMETRY_S:=0}"
: "${MQTT_TOPIC:=v1/devices/me/telemetry}"
[ -z "${MQTT_PAYLOAD:-}" ] && MQTT_PAYLOAD='{"lt":1}'
: "${MQTT_IFADDR:=}"
: "${TOC_DO_NOI:=500}"

PIDS=()

bao() { printf '%s  %s\n' "$(date '+%H:%M:%S')" "$*"; }

can_cong_cu() {
  if ! command -v emqtt_bench >/dev/null 2>&1; then
    echo "Không thấy emqtt_bench. Cài theo README mục 'Cài công cụ' (script này không tự cài)."
    exit 2
  fi
  TRO_GIUP="$(emqtt_bench conn --help 2>&1; emqtt_bench pub --help 2>&1)"
}

# Bản emqtt-bench khác nhau có cờ khác nhau. Chỉ dùng cờ mà bản đang cài thật sự có.
co_co() { printf '%s' "$TRO_GIUP" | grep -q -- "$1"; }

can_may_chu() {
  if [ -z "${MQTT_HOST:-}" ]; then
    echo "Thiếu MQTT_HOST. Đặt rõ ràng, vd. export MQTT_HOST=<broker test>. Không có mặc định là cố ý."
    exit 2
  fi
}

# B10 quy tắc 2: không chạy hai bài chồng nhau.
khong_chong_bai() {
  local dang
  dang=$(pgrep -fl 'emqtt_bench (conn|pub|sub)|do_phien[.]py|ban_rps[.]py|k6 run' 2>/dev/null | grep -v "pgrep" || true)
  if [ -n "$dang" ]; then
    echo "Đang có bài khác chạy (B10 quy tắc 2 — không chạy chồng):"
    echo "$dang"
    exit 1
  fi
}

# Mọi bài thiết bị đều đập vào broker thật (DEV dùng chung) — hỏi lại trước khi bắn.
xac_nhan() {
  case "$MQTT_HOST" in 127.0.0.1|localhost|::1) return 0 ;; esac
  echo
  echo "Sắp bắn vào broker THẬT: $MQTT_HOST:$MQTT_PORT  ($*)"
  echo "DEV là môi trường dùng chung, ThingsBoard 1 nút 2 vCPU, đĩa gần đầy (tài liệu mục 0.2)."
  echo "Đã báo đội, đã xử lý đĩa, đã đăng ký danh tính/chứng thư cho máy phát chưa?"
  printf "Gõ 'co' để chạy: "; read -r tl
  [ "$tl" = "co" ] || { echo "Bỏ qua."; exit 1; }
}

so_ip_nguon() {
  if [ -z "$MQTT_IFADDR" ]; then echo 1; else echo "$MQTT_IFADDR" | tr ',' '\n' | grep -c .; fi
}

ip_nguon_so() {  # ip_nguon_so <i>
  [ -z "$MQTT_IFADDR" ] && return 0
  echo "$MQTT_IFADDR" | tr ',' '\n' | grep . | awk -v i="$1" -v n="$(so_ip_nguon)" 'NR == (i % n) + 1'
}

dai_cong_tam() {  # số cổng tạm dùng được tới MỘT IP:cổng đích
  if [ -r /proc/sys/net/ipv4/ip_local_port_range ]; then
    awk '{print $2 - $1 + 1}' /proc/sys/net/ipv4/ip_local_port_range
  elif command -v sysctl >/dev/null 2>&1 && sysctl -n net.inet.ip.portrange.first >/dev/null 2>&1; then
    echo $(( $(sysctl -n net.inet.ip.portrange.last) - $(sysctl -n net.inet.ip.portrange.first) + 1 ))
  else
    echo 28232
  fi
}

# Kiểm giới hạn máy phát cho N kết nối: ulimit -n và cổng tạm theo số IP nguồn (mục 1.4).
kiem_may_phat() {
  local n=$1 hien cong ip can_ip
  hien=$(ulimit -n)
  if [ "$hien" != "unlimited" ] && [ "$hien" -lt $(( n / $(so_ip_nguon) + 2000 )) ]; then
    ulimit -n $(( n + 2000 )) 2>/dev/null
    hien=$(ulimit -n)
  fi
  bao "ulimit -n = $hien (cần ≥ $(( n / $(so_ip_nguon) + 2000 )) mỗi tiến trình; mục tiêu cuối ≥ 1.048.576 ở CẢ hai phía)"
  if [ "$hien" != "unlimited" ] && [ "$hien" -lt $(( n / $(so_ip_nguon) + 2000 )) ]; then
    echo "CẢNH BÁO: ulimit -n quá thấp — máy phát sẽ gãy trước broker. Nâng (limits.conf / ulimit -Hn) rồi chạy lại."
    printf "Vẫn chạy? [y/N] "; read -r tl; case "$tl" in y|Y) ;; *) exit 1 ;; esac
  fi
  cong=$(dai_cong_tam); ip=$(so_ip_nguon)
  can_ip=$(( (n + cong - 1) / cong ))
  bao "Cổng tạm mỗi IP nguồn: $cong · IP nguồn đang có: $ip · cần ít nhất: $can_ip cho $n kết nối (1 IP:cổng đích)"
  if [ "$ip" -lt "$can_ip" ]; then
    echo "CẢNH BÁO: không đủ IP nguồn — quá $cong kết nối/IP sẽ lỗi 'address not available' ở MÁY PHÁT."
    echo "Thêm IP vào MQTT_IFADDR (mỗi IP một tiến trình), hoặc thêm máy phát."
    printf "Vẫn chạy? [y/N] "; read -r tl; case "$tl" in y|Y) ;; *) exit 1 ;; esac
  fi
}

# Dựng các cờ xác thực/TLS cho một nhóm bắt đầu ở số $1.
co_xac_thuc() {
  local dau=$1
  case "$MQTT_XAC_THUC" in
    mtls)
      local c=${MQTT_CERT:-} k=${MQTT_KEY:-}
      if [ -n "${MQTT_CHUNG_THU_DIR:-}" ]; then
        c="$MQTT_CHUNG_THU_DIR/${MQTT_PREFIX}${dau}.crt"; k="$MQTT_CHUNG_THU_DIR/${MQTT_PREFIX}${dau}.key"
      fi
      [ -f "$c" ] && [ -f "$k" ] || { echo "Thiếu chứng thư client: $c / $k" >&2; return 1; }
      printf -- '-S --certfile %s --keyfile %s ' "$c" "$k"
      ;;
    clientid)
      printf -- '-S '
      ;;
    token)
      [ -n "${MQTT_TOKEN:-}" ] || { echo "Thiếu MQTT_TOKEN" >&2; return 1; }
      printf -- '-S -u %s ' "$MQTT_TOKEN"
      ;;
    *) echo "MQTT_XAC_THUC lạ: $MQTT_XAC_THUC" >&2; return 1 ;;
  esac
  if [ -n "${MQTT_CA:-}" ]; then
    if co_co --cacertfile; then printf -- '--cacertfile %s ' "$MQTT_CA"
    else echo "Bản emqtt-bench này không có --cacertfile — bỏ qua MQTT_CA (không kiểm chứng thư máy chủ)." >&2; fi
  fi
}

# exec_nhom <nhãn> <số kết nối> <số bắt đầu> <khoảng nối ms> <chỉ số IP> [cờ thêm...]
# THAY tiến trình hiện tại bằng emqtt_bench (dùng trong subshell). Log ở $KQ/<nhãn>.log.
exec_nhom() {
  local nhan=$1 n=$2 dau=$3 khoang=$4 ip_i=$5; shift 5
  local lenh=conn xt ip co_them=()
  xt=$(co_xac_thuc "$dau") || exit 1
  ip=$(ip_nguon_so "$ip_i")
  if [ "$NHIP_TELEMETRY_S" != "0" ]; then
    lenh=pub
    co_them+=(-t "$MQTT_TOPIC" -I $(( NHIP_TELEMETRY_S * 1000 )) -q "${MQTT_QOS:-1}")
    if co_co --message; then co_them+=(-m "$MQTT_PAYLOAD"); else co_them+=(-s 16); fi
  fi
  [ -n "$ip" ] && co_them+=(--ifaddr "$ip")
  co_co --shortids && co_them+=(--shortids)
  # MQTT 3.1.1 như mạch thật (ESP-IDF). Đo 12/10/2026: ThingsBoard DEV từ chối kết nối MQTT 5
  # mặc định của emqtt-bench (client_identifier_not_valid) mà nhận đúng clientId ở -V 4.
  co_them+=(-V "${MQTT_PHIEN_BAN:-4}")
  echo "$(date +%s),$nhan,bat_dau,$n,$dau,$ip" >> "$KQ/su_kien.csv"
  # shellcheck disable=SC2086
  exec emqtt_bench $lenh -h "$MQTT_HOST" -p "$MQTT_PORT" -c "$n" -n "$dau" -i "$khoang" \
    -k "$MQTT_KEEPALIVE" --prefix "$MQTT_PREFIX" $xt ${co_them[@]+"${co_them[@]}"} "$@" \
    > "$KQ/$nhan.log" 2>&1
}

# chay_nhom — như exec_nhom nhưng chạy NỀN; PID (chính là PID emqtt_bench) thêm vào PIDS.
chay_nhom() {
  ( exec_nhom "$@" ) &
  PIDS+=($!)
}

# chay_nhom_tre <giây trễ> <như chay_nhom...> — khởi động sau một khoảng (jitter của B3-b).
chay_nhom_tre() {
  local tre=$1; shift
  ( sleep "$tre" && exec_nhom "$@" ) &
  PIDS+=($!)
}

# Tổng số kết nối đang giữ, đọc từ dòng thống kê mới nhất của mỗi log emqtt_bench.
# emqtt-bench in kiểu "connect_succ total=N" (bản mới) hoặc "connected(...): total=N" (bản cũ).
dem_da_noi() {
  local tong=0 f so
  for f in "$KQ"/"$1"*.log; do
    [ -f "$f" ] || continue
    so=$(grep -Eo '(connect_succ|connected)[^,]*total=[0-9]+' "$f" | tail -1 | grep -Eo '[0-9]+$')
    tong=$(( tong + ${so:-0} ))
  done
  echo "$tong"
}

dem_loi_noi() {
  local tong=0 f so
  for f in "$KQ"/"$1"*.log; do
    [ -f "$f" ] || continue
    so=$(grep -Eo 'connect_fail[^,]*total=[0-9]+' "$f" | tail -1 | grep -Eo '[0-9]+$')
    tong=$(( tong + ${so:-0} ))
  done
  echo "$tong"
}

dung_het() {
  local p
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done
  sleep 2
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill -9 "$p" 2>/dev/null; done
  PIDS=()
}

mo_thu_muc_kq() {  # mo_thu_muc_kq <tên bài>
  KQ="$GOC/loadtest/ketqua/mqtt_${DAU}_$1"
  mkdir -p "$KQ"
  echo "epoch,nhan,su_kien,so,dau,ip" > "$KQ/su_kien.csv"
  {
    echo "bai=$1 host=$MQTT_HOST port=$MQTT_PORT xac_thuc=$MQTT_XAC_THUC keepalive=$MQTT_KEEPALIVE"
    echo "nhip_telemetry_s=$NHIP_TELEMETRY_S ifaddr=$MQTT_IFADDR toc_do_noi=$TOC_DO_NOI prefix=$MQTT_PREFIX"
    emqtt_bench --version 2>/dev/null || true
  } > "$KQ/cau_hinh.txt"
  bao "Kết quả ghi vào $KQ  (su_kien.csv có mốc epoch để ghép với đồ thị CPU/RAM/fd của broker — B10 quy tắc 4)"
}
