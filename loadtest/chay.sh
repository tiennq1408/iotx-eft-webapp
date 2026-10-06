#!/usr/bin/env bash
# Gọi bộ đo theo SỐ KỊCH BẢN, khỏi phải nhớ tham số.
#
#   ./loadtest/chay.sh thu     thử bộ đo bằng IBS giả, không đụng DEV
#   ./loadtest/chay.sh kiem    câu hỏi chặn cả ngày: một tài khoản mở được nhiều phiên?
#   ./loadtest/chay.sh 1       kịch bản 1 — bão đăng nhập, thang bậc 100/300/1000
#   ./loadtest/chay.sh 2       kịch bản 2 — giữ phiên dài 2 giờ
#   ./loadtest/chay.sh 3       kịch bản 3 — bão nối lại (nửa client)
#   ./loadtest/chay.sh 6       kịch bản 6 — mạng kém, thao tác hỏng (trình duyệt thật)
#   ./loadtest/chay.sh 8       kịch bản 8 — soak 12 giờ, chạy nền qua đêm
#
# Kịch bản 4, 5, 7 và nửa server của 3 chưa chạy được — xem README.

set -u
cd "$(dirname "$0")/.." || exit 1
TD=loadtest
KQ=$TD/ketqua
DAU=$(date +%Y%m%d_%H%M)

[ -f "$TD/.venv/bin/activate" ] && . "$TD/.venv/bin/activate"
mkdir -p "$KQ"

can_tai_khoan() {
  if [ -z "${IOTX_EMAIL:-}" ] || [ -z "${IOTX_PASSWORD:-}" ]; then
    echo "Thiếu IOTX_EMAIL / IOTX_PASSWORD. Đặt trước:"
    echo "  export IOTX_EMAIL='...'"
    echo "  export IOTX_PASSWORD='...'"
    exit 2
  fi
}

# Mỗi phiên giữ một kết nối mở. macOS mặc định 256 tệp mở — chưa tới 300 phiên đã gãy,
# và cột kh.tới trong kết quả sẽ đầy lỗi trông như máy chủ hỏng.
can_ulimit() {
  local can=$1 hien
  hien=$(ulimit -n)
  if [ "$hien" != "unlimited" ] && [ "$hien" -lt "$can" ]; then
    ulimit -n "$can" 2>/dev/null
    hien=$(ulimit -n)
  fi
  if [ "$hien" != "unlimited" ] && [ "$hien" -lt "$can" ]; then
    echo "CẢNH BÁO: giới hạn tệp mở đang là $hien, cần ít nhất $can."
    echo "Chạy 'ulimit -n 65536' trong terminal này rồi chạy lại, nếu không kết quả sẽ sai."
    printf "Vẫn chạy? [y/N] "; read -r tl
    case "$tl" in y|Y) ;; *) exit 1 ;; esac
  else
    echo "Giới hạn tệp mở: $hien — đủ."
  fi
}

mot_luot() {  # mot_luot <nhãn> <số phiên> <ramp> <duration> [thêm...]
  local nhan=$1 n=$2 ramp=$3 dur=$4; shift 4
  local f="$KQ/${DAU}_${nhan}.jsonl"
  echo
  echo "=== $nhan — $n phiên, dựng $ramp s, chạy $dur s ==="
  python3 "$TD/do_phien.py" --sessions "$n" --ramp "$ramp" --duration "$dur" --out "$f" "$@" || return 1
  python3 "$TD/tong_hop.py" "$f"
}

case "${1:-}" in
  thu)
    echo "Dựng IBS giả ở cổng 4020..."
    python3 "$TD/ibs_gia.py" & GIA=$!
    trap 'kill $GIA 2>/dev/null' EXIT
    sleep 2
    IOTX_EMAIL=thu@example.com IOTX_PASSWORD=matkhau123 \
    IOTX_BASE=http://127.0.0.1:4020/v1 \
      mot_luot thu_ibs_gia 25 8 60 --cut-at 35
    echo
    echo "Chạy đúng thì tỉ lệ theo giao dịch trên 99% và có dòng 'Thời gian hồi phục sau khi đứt'."
    ;;
  kiem)
    can_tai_khoan
    python3 "$TD/kiem_tra_phien.py"
    ;;
  1)
    can_tai_khoan; can_ulimit 4096
    mot_luot kb1_100  100  60  600 || exit 1
    mot_luot kb1_300  300 120  600 || exit 1
    echo
    echo "Trước lượt 1000 phiên: DEV là môi trường dùng chung, nên báo đội một câu."
    printf "Chạy lượt 1000 phiên? [y/N] "; read -r tl
    case "$tl" in y|Y) can_ulimit 16384; mot_luot kb1_1000 1000 300 900 ;; *) echo "Bỏ qua." ;; esac
    ;;
  2)
    can_tai_khoan; can_ulimit 4096
    mot_luot kb2_200 200 120 7200
    ;;
  3)
    can_tai_khoan; can_ulimit 4096
    mot_luot kb3_300 300 60 900 --cut-at 300
    ;;
  6)
    can_tai_khoan
    if ! curl -s -o /dev/null --max-time 5 http://localhost:3000; then
      echo "Không thấy app ở http://localhost:3000. Chạy 'npm run dev' ở cửa sổ khác trước."
      exit 1
    fi
    echo "Bài luồng chết âm thầm mất 70 giây, đừng tưởng treo."
    shift || true
    python3 "$TD/kich_ban_6.py" --out "$KQ/${DAU}_kb6.jsonl" "$@"
    echo
    echo "Thêm --cho-phep-bat-tat để chạy cả hai bài gửi lệnh thật (quạt sẽ bật tắt)."
    ;;
  8)
    can_tai_khoan; can_ulimit 4096
    f="$KQ/${DAU}_kb8_qua_dem.jsonl"
    nohup python3 "$TD/do_phien.py" --sessions 200 --ramp 120 --duration 43200 \
      --out "$f" > "$KQ/${DAU}_kb8.log" 2>&1 &
    echo "Đã bật soak 12 giờ, PID $!."
    echo "Sáng mai đọc:  python3 $TD/tong_hop.py $f"
    echo "Muốn dừng sớm: kill $!   (file kết quả vẫn dùng được)"
    ;;
  *)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
