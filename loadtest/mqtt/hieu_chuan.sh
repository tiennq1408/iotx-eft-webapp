#!/usr/bin/env bash
# B1-04 / B1-05 / B1-06 — ghi lý lịch MỘT máy phát, và tính số IP nguồn / số máy phát cần.
#
#   ./loadtest/mqtt/hieu_chuan.sh                       ghi ulimit, cổng tạm, CPU, RAM, NTP, IP
#   MUC_TIEU="100000 1000000" SO_DICH=1 TRAN_MAY_PHAT=60000 ./loadtest/mqtt/hieu_chuan.sh
#
# Chỉ ĐỌC thông tin của chính máy này — không gửi gói tin nào ra ngoài. Chạy trên TỪNG máy
# phát, gom các tệp lại cùng chỗ với kết quả bài.
#   MUC_TIEU       các mức kết nối cần tính (mặc định "100000 1000000")
#   SO_DICH        số cặp IP:cổng đích của broker/bộ cân tải (mặc định 1 — trường hợp xấu nhất, mục 1.4)
#   TRAN_MAY_PHAT  trần kết nối giữ được của MỘT máy phát, đo ở B1-02 (để trống nếu chưa đo)

set -u
GOC="$(cd "$(dirname "$0")/../.." && pwd)"
KQ="$GOC/loadtest/ketqua"; mkdir -p "$KQ"
TEP="$KQ/hieu_chuan_$(hostname -s)_$(date +%Y%m%d_%H%M).txt"
MUC_TIEU=${MUC_TIEU:-"100000 1000000"}
SO_DICH=${SO_DICH:-1}
TRAN_MAY_PHAT=${TRAN_MAY_PHAT:-}

doc() { "$@" 2>/dev/null || echo "(không đọc được)"; }

{
  echo "=== Hiệu chuẩn máy phát — $(date '+%Y-%m-%d %H:%M:%S %z') ==="
  echo "Máy: $(hostname)   Hệ: $(uname -srm)"
  if [ "$(uname)" = "Linux" ]; then
    echo "CPU: $(nproc) lõi — $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2-)"
    echo "RAM: $(free -h | awk '/Mem:/ {print $2 " tổng, " $7 " còn dùng được"}')"
    echo "Cổng tạm (ip_local_port_range): $(cat /proc/sys/net/ipv4/ip_local_port_range)"
    echo "fs.nr_open: $(doc cat /proc/sys/fs/nr_open)   fs.file-max: $(doc cat /proc/sys/fs/file-max)"
    echo "net.core.somaxconn: $(doc cat /proc/sys/net/core/somaxconn)   tcp_tw_reuse: $(doc cat /proc/sys/net/ipv4/tcp_tw_reuse)"
    echo "tcp_max_orphans: $(doc cat /proc/sys/net/ipv4/tcp_max_orphans)   tcp_orphan_retries: $(doc cat /proc/sys/net/ipv4/tcp_orphan_retries)"
    echo "NTP (B1-06): $(doc timedatectl show -p NTPSynchronized --value) (yes = đã đồng bộ)"
    echo "IP v4 trên máy (ứng viên MQTT_IFADDR):"; ip -4 -o addr show 2>/dev/null | awk '{print "   " $2 "  " $4}'
  else
    echo "CPU: $(sysctl -n hw.ncpu) lõi — $(sysctl -n machdep.cpu.brand_string 2>/dev/null)"
    echo "RAM: $(( $(sysctl -n hw.memsize) / 1073741824 )) GB"
    echo "Cổng tạm: $(sysctl -n net.inet.ip.portrange.first)–$(sysctl -n net.inet.ip.portrange.last)"
    echo "kern.maxfiles: $(sysctl -n kern.maxfiles)   kern.maxfilesperproc: $(sysctl -n kern.maxfilesperproc)"
    echo "NTP (B1-06): macOS — kiểm trong Cài đặt > Ngày & Giờ; máy phát thật nên là Linux"
    echo "IP v4 trên máy:"; ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print "   " $2}'
  fi
  echo "ulimit -n (mềm): $(ulimit -n)   ulimit -Hn (cứng): $(ulimit -Hn)   ulimit -u: $(ulimit -u)"
  echo "emqtt_bench: $(command -v emqtt_bench || echo 'chưa cài')   k6: $(k6 version 2>/dev/null || echo 'chưa cài')"
  echo
  echo "=== B1-05 — cần bao nhiêu IP nguồn / máy phát (mục 1.4) ==="
  if [ -r /proc/sys/net/ipv4/ip_local_port_range ]; then
    CONG=$(awk '{print $2 - $1 + 1}' /proc/sys/net/ipv4/ip_local_port_range)
  else
    CONG=$(( $(sysctl -n net.inet.ip.portrange.last) - $(sysctl -n net.inet.ip.portrange.first) + 1 ))
  fi
  echo "Cổng tạm mỗi IP nguồn: $CONG  (lý thuyết tối đa ~64.500)   Số IP:cổng đích: $SO_DICH"
  for N in $MUC_TIEU; do
    LT=$(( (N + 64500 * SO_DICH - 1) / (64500 * SO_DICH) ))
    TT=$(( (N + CONG * SO_DICH - 1) / (CONG * SO_DICH) ))
    printf "  %9d kết nối: IP nguồn tối thiểu %3d (lý thuyết), %3d (theo dải cổng máy này)" "$N" "$LT" "$TT"
    if [ -n "$TRAN_MAY_PHAT" ]; then
      # B1 quy tắc: chỉ chạy ở ≤ 70% trần máy phát đã đo.
      printf ", máy phát %3d (70%% của trần %d)" $(( (N * 10 + 7 * TRAN_MAY_PHAT - 1) / (7 * TRAN_MAY_PHAT) )) "$TRAN_MAY_PHAT"
    fi
    echo
  done
  echo "  ulimit -n cần ≥ 1.048.576 ở CẢ máy phát lẫn broker cho mức 1 triệu."
  [ -z "$TRAN_MAY_PHAT" ] && echo "  Chưa có TRAN_MAY_PHAT — đo bằng ./loadtest/chay.sh mqtt-b1 (B1-02) rồi chạy lại."
} | tee "$TEP"
echo
echo "Đã ghi: $TEP"
