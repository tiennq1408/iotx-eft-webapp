#!/usr/bin/env bash
# Gọi bộ đo theo MÃ BÀI của tài liệu kịch bản bản 3 (B1…B10), khỏi phải nhớ tham số.
#
# Thử, không đụng máy chủ thật:
#   ./loadtest/chay.sh thu        thử mô phỏng phiên (SSE + hỏi vòng) bằng IBS giả
#   ./loadtest/chay.sh thu-rps    thử bắn theo req/s (50/100/200, giữ 20 s) bằng IBS giả, có 429 giả
#   ./loadtest/chay.sh b1         B1-03 trần máy phát HTTP vào IBS giả + B1-04/05 lý lịch máy phát
#
# Nhánh NGƯỜI DÙNG (bắn vào IBS thật — hỏi xác nhận trước):
#   ./loadtest/chay.sh kiem       câu hỏi chặn: một tài khoản mở được nhiều phiên?
#   ./loadtest/chay.sh moc        mốc chuẩn B10: 100 phiên × 5 phút (trước và sau mỗi bài lớn)
#   ./loadtest/chay.sh b5         B5 thông lượng req/s — k6 nếu có, không thì Python ở bậc thấp
#   ./loadtest/chay.sh b6         B6 thang bậc phiên 1000 → 50000 (dừng ở bậc đầu tiên trượt)
#   ./loadtest/chay.sh b7         B7 cao điểm: nền + 3 lần 15.000 người mở app cùng lúc (B7_CACH=rps: k6 bơm req/s)
#   ./loadtest/chay.sh b8         B8 hai nhánh cùng lúc — in hướng dẫn
#   ./loadtest/chay.sh b9         B9 trình duyệt thật (app production ở cổng 3000)
#
# Nhánh THIẾT BỊ (MQTT/TLS vào ThingsBoard — cần emqtt-bench, MQTT_HOST):
#   ./loadtest/chay.sh mqtt-ca    sinh CA TEST + lô chứng thư client (không gửi gì đi đâu)
#   ./loadtest/chay.sh mqtt-b1    B1-01 chi phí bắt tay + B1-02 trần một máy phát
#   ./loadtest/chay.sh mqtt-b2    B2 thang bậc kết nối 1.000 → 1.000.000
#   ./loadtest/chay.sh mqtt-b3a   B3-a bão nối lại, nối lại ngay
#   ./loadtest/chay.sh mqtt-b3b   B3-b bão nối lại, có jitter
#   ./loadtest/chay.sh mqtt-b4    B4 telemetry khi đầy tải
#
# Lệnh cũ (mã kịch bản bản 1) vẫn chạy: 1, 2, 3, 6, 8.
# Mọi lệnh đều kiểm `pgrep` trước (B10 quy tắc 2) và chỉ dùng biến môi trường cho tài khoản.

set -u
cd "$(dirname "$0")/.." || exit 1
TD=loadtest
KQ=$TD/ketqua
DAU=$(date +%Y%m%d_%H%M)
export DAU

[ -f "$TD/.venv/bin/activate" ] && . "$TD/.venv/bin/activate"

# Python cài từ python.org trên macOS KHÔNG dùng kho chứng thư của hệ điều hành: mọi lời gọi
# HTTPS hỏng với CERTIFICATE_VERIFY_FAILED và bị đếm là "không tới được" — trông như máy phát
# gãy. Trỏ OpenSSL vào kho của certifi (có sẵn trong venv) nếu người chạy chưa tự đặt.
if [ -z "${SSL_CERT_FILE:-}" ]; then
  KHO_CT=$(python3 -c 'import certifi; print(certifi.where())' 2>/dev/null)
  [ -n "$KHO_CT" ] && export SSL_CERT_FILE="$KHO_CT"
fi

# Tài khoản đặt trong tệp loadtest/.tai-khoan (đã .gitignore, quyền 600) để chạy được không cần
# người ngồi gõ: hai dòng `export IOTX_EMAIL='…'` và `export IOTX_PASSWORD='…'`. Biến đã đặt sẵn
# trong terminal thì thắng tệp.
if [ -z "${IOTX_EMAIL:-}" ] && [ -f "$TD/.tai-khoan" ]; then
  case "$(stat -f %Lp "$TD/.tai-khoan" 2>/dev/null || stat -c %a "$TD/.tai-khoan")" in
    600|400) . "$TD/.tai-khoan" ;;
    *) echo "loadtest/.tai-khoan đang để người khác đọc được. Chạy: chmod 600 loadtest/.tai-khoan"; exit 2 ;;
  esac
fi
mkdir -p "$KQ"

can_tai_khoan() {
  if [ -z "${IOTX_EMAIL:-}" ] || [ -z "${IOTX_PASSWORD:-}" ]; then
    echo "Thiếu IOTX_EMAIL / IOTX_PASSWORD. Đặt trước:"
    echo "  export IOTX_EMAIL='...'"
    echo "  export IOTX_PASSWORD='...'"
    exit 2
  fi
}

# B10 quy tắc 2: không chạy hai bài chồng nhau. Tài liệu chỉ ghi do_phien.py; kiểm thêm
# các máy phát mới cho chắc.
khong_chong_bai() {
  local dang
  dang=$(pgrep -fl 'do_phien[.]py|ban_rps[.]py|k6 run|emqtt_bench (conn|pub|sub)' 2>/dev/null || true)
  if [ -n "$dang" ]; then
    echo "Đang có bài khác chạy — B10 quy tắc 2, không chạy chồng:"
    echo "$dang"
    exit 1
  fi
}

may_chu() { echo "${IOTX_BASE:-https://web.dev.happibot.net/v1}"; }

# Mọi lệnh bắn vào máy chủ thật đều hỏi lại — DEV là môi trường dùng chung.
xac_nhan_that() {
  case "$(may_chu)" in http://127.0.0.1*|http://localhost*) return 0 ;; esac
  echo
  echo "Sắp bắn vào máy chủ THẬT: $(may_chu)  — $*"
  echo "DEV là môi trường dùng chung: báo đội một câu, và chạy mốc chuẩn (./loadtest/chay.sh moc) trước/sau."
  printf "Chạy? [y/N] "; read -r tl
  case "$tl" in y|Y) ;; *) echo "Bỏ qua."; exit 1 ;; esac
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
  python3 "$TD/tong_hop.py" "$f" | tee "$KQ/${DAU}_${nhan}.txt"
}

dung_ibs_gia() {  # dung_ibs_gia [cờ cho ibs_gia.py...]
  if curl -s -o /dev/null --max-time 2 http://127.0.0.1:4020/v1/products; then
    echo "Cổng 4020 đang có máy chủ khác (một IBS giả cũ?). Tắt nó trước: pgrep -fl ibs_gia.py"
    exit 1
  fi
  echo "Dựng IBS giả ở cổng 4020..."
  python3 "$TD/ibs_gia.py" "$@" & GIA=$!
  trap 'kill $GIA 2>/dev/null' EXIT
  sleep 2
  export IOTX_EMAIL=thu@example.com IOTX_PASSWORD=matkhau123 IOTX_BASE=http://127.0.0.1:4020/v1
}

luot_rps() {  # luot_rps <nhãn> [cờ cho ban_rps.py...]
  local nhan=$1; shift
  local f="$KQ/${DAU}_${nhan}.jsonl"
  python3 "$TD/ban_rps.py" --out "$f" "$@" || return 1
  python3 "$TD/tong_hop.py" "$f" | tee "$KQ/${DAU}_${nhan}.txt"
}

can_k6() {
  command -v k6 >/dev/null 2>&1 || { echo "Không thấy k6. Cài theo README mục 'Cài công cụ' (script không tự cài)."; return 1; }
}

LENH=${1:-}
[ -n "$LENH" ] && shift
case "$LENH" in
  thu)
    khong_chong_bai
    dung_ibs_gia
    mot_luot thu_ibs_gia 25 8 60 --cut-at 35
    echo
    echo "Chạy đúng thì tỉ lệ theo giao dịch trên 99%, có dòng 'Thời gian hồi phục sau khi đứt',"
    echo "và mục REQ/S THỰC TẾ khớp lý thuyết trong vài phần trăm."
    ;;
  thu-rps)
    khong_chong_bai
    dung_ibs_gia --suc-chua 25 --ti-le-loi-rpc 0 --ti-le-429 0.002
    luot_rps thu_rps --bac 50,100,200 --giu 20 --so-ve 30 --rpc-device dev-1
    echo
    echo "IBS giả chỉ xử lý 25 lời gọi cùng lúc (~150 req/s) và trả 0,2% 429: bậc 200 phải trượt p95,"
    echo "cột 429 phải có số, và mọi bậc trượt 'thành công ≥ 99,9%' vì 429 tính là không thành công."
    ;;
  b1)
    khong_chong_bai
    echo "=== B1-04/05: lý lịch máy phát ==="
    "$TD/mqtt/hieu_chuan.sh"
    echo
    echo "=== B1-03: trần máy phát HTTP — bắn vào IBS giả KHÔNG giới hạn ==="
    echo "Máy chủ giả chạy CÙNG máy nên hai bên tranh CPU: con số ra là cận dưới của trần máy phát."
    dung_ibs_gia --suc-chua 0 --ti-le-loi-rpc 0
    luot_rps b1_tran_may_phat --bac "${B1_BAC:-200,500,1000,2000}" --giu "${B1_GIU:-30}" --so-ve 50 --rpc-device dev-1
    echo
    echo "Trần máy phát = bậc cuối mà 'Máy phát trễ lịch p95' còn ≤ 100 ms và không có 'máy phát bỏ'."
    echo "Quy tắc B1: mọi bài chỉ chạy ≤ 70% trần đó."
    ;;
  kiem)
    khong_chong_bai; can_tai_khoan
    xac_nhan_that "kiểm một tài khoản mở nhiều phiên"
    python3 "$TD/kiem_tra_phien.py"
    ;;
  moc)
    khong_chong_bai; can_tai_khoan; can_ulimit 4096
    xac_nhan_that "mốc chuẩn 100 phiên × 5 phút"
    mot_luot moc_100 100 30 330
    echo "So bảng này với mốc trước bài. Lệch nhiều = máy chủ chưa hồi, số bài sau không dùng được (B10 quy tắc 3)."
    ;;
  b5)
    khong_chong_bai; can_tai_khoan
    CACH=${1:-}
    [ -z "$CACH" ] && { can_k6 >/dev/null 2>&1 && CACH=k6 || CACH=python; }
    if [ "$CACH" = "k6" ]; then
      can_k6 || exit 2
      BAC_K6=${B5_BAC:-500,1000,3000,6000,10000,15000,20000}
      xac_nhan_that "B5 k6, bậc $BAC_K6 req/s, giữ ${B5_GIU:-300} s mỗi bậc"
      f="$KQ/${DAU}_b5_k6.json.gz"
      IOTX_BASE="$(may_chu)" BAC="$BAC_K6" GIU="${B5_GIU:-300}" RPC_DEVICE="${IOTX_RPC_DEVICE:-}" \
        k6 run --out "json=$f" "$TD/k6/b5_thong_luong.js"
      python3 "$TD/tong_hop.py" "$f" | tee "$KQ/${DAU}_b5_k6.txt"
    else
      BAC_PY=${B5_BAC:-100,200,500}
      echo "Không dùng k6: Python một tiến trình: trần đo được ~9.000 req/s trên loopback không TLS, qua HTTPS thật thấp hơn nhiều. Bậc 3.000+ dùng k6."
      xac_nhan_that "B5 Python, bậc $BAC_PY req/s, giữ ${B5_GIU:-300} s mỗi bậc"
      can_ulimit 16384
      co=()
      [ -n "${IOTX_RPC_DEVICE:-}" ] && co=(--rpc-device "$IOTX_RPC_DEVICE")
      luot_rps b5_python --bac "$BAC_PY" --giu "${B5_GIU:-300}" --so-ve "${B5_SO_VE:-50}" ${co[@]+"${co[@]}"}
    fi
    ;;
  b6)
    khong_chong_bai; can_tai_khoan; can_ulimit 65536
    BAC6=${B6_BAC:-"1000 5000 10000 30000 50000"}
    xac_nhan_that "B6 thang bậc phiên $BAC6, giữ 5 phút mỗi bậc"
    echo "Một máy chỉ có ~16–28 nghìn cổng tạm tới một đích: bậc ≥ 30.000 cần nhiều IP / nhiều máy (mục 1.4)."
    for N in $BAC6; do
      if [ "$N" -ge 5000 ]; then
        printf "Chạy bậc %s phiên? [y/N] " "$N"; read -r tl
        case "$tl" in y|Y) ;; *) echo "Dừng ở đây."; break ;; esac
      fi
      R=$(( N / 50 )); [ "$R" -lt 60 ] && R=60
      mot_luot "b6_$N" "$N" "$R" $(( R + 300 )) --xem-ky-ti-le "${B6_XEM_KY:-0.25}" || break
      if grep -q -E "BẬC CUỐI CÒN ĐẠT SLA: không|KẾT QUẢ KHÔNG DÙNG ĐƯỢC" "$KQ/${DAU}_b6_$N.txt"; then
        echo "Bậc $N trượt SLA hoặc máy phát gãy — dừng thang (B0)."
        break
      fi
    done
    ;;
  b7)
    # Cao điểm theo cách hiểu đã chốt (12/10/2026): "15.000 user" là 15.000 NGƯỜI MỞ APP cùng
    # lúc, không phải 15.000 req/s. Mỗi người: đăng nhập → mở app (5 lời gọi) → giữ SSE → hỏi
    # vòng /bootstrap ⇒ 15.000 người ≈ 1.500–6.000 req/s + 15.000 kết nối giữ mở (mục 1.2).
    # B7_CACH=rps giữ kiểu cũ: k6 bơm DINH req/s.
    khong_chong_bai; can_tai_khoan
    CACH7=${B7_CACH:-mo-app}
    PHIEN=${B7_PHIEN:-0}
    if [ "$CACH7" = "rps" ]; then
      can_k6 || exit 2
      NEN=${NEN_RPS:-$([ "$PHIEN" -gt 0 ] && echo 0 || echo 1000)}
      xac_nhan_that "B7 (kiểu req/s): nền ${NEN} req/s + ${PHIEN} phiên, 3 lần bơm ${DINH:-15000} req/s × 60 s"
    else
      DINH7=${B7_DINH:-15000}; RAMP7=${B7_RAMP:-60}; GIU7=${B7_GIU:-60}; LAN7=${B7_LAN:-3}; CACH_NHAU=${B7_CACH_NHAU:-300}
      xac_nhan_that "B7 (bão mở app): nền ${PHIEN} phiên + ${LAN7} lần ${DINH7} người mở app trong ${RAMP7} s, giữ ${GIU7} s, cách nhau ${CACH_NHAU} s"
      echo "Một IP nguồn chỉ có ~16.000 cổng tạm: ${DINH7} phiên giữ SSE cần ≥ $(( (DINH7 + PHIEN) / 14000 + 1 )) IP nguồn / máy phát (mục 1.4)."
    fi
    if [ "$PHIEN" -gt 0 ]; then
      can_ulimit 65536
      R=$(( PHIEN / 50 )); [ "$R" -lt 60 ] && R=60
      TONG_NEN=$(( R + 1420 ))
      [ "$CACH7" != "rps" ] && TONG_NEN=$(( R + LAN7 * (RAMP7 + GIU7 + CACH_NHAU) + 120 ))
      fp="$KQ/${DAU}_b7_phien_nen.jsonl"
      echo "Dựng $PHIEN phiên nền trong $R s rồi mới bơm (đo được 'có mất phiên nền không')."
      python3 "$TD/do_phien.py" --sessions "$PHIEN" --ramp "$R" --duration "$TONG_NEN" --out "$fp" &
      PNEN=$!
      trap 'kill $PNEN 2>/dev/null' EXIT
      sleep "$R"
    fi
    if [ "$CACH7" = "rps" ]; then
      f="$KQ/${DAU}_b7_k6.json.gz"
      IOTX_BASE="$(may_chu)" NEN_RPS="$NEN" RPC_DEVICE="${IOTX_RPC_DEVICE:-}" \
        k6 run --out "json=$f" "$TD/k6/b7_cao_diem.js"
      python3 "$TD/tong_hop.py" "$f" --buoc 10 | tee "$KQ/${DAU}_b7_k6.txt"
    else
      can_ulimit 65536
      for i in $(seq 1 "$LAN7"); do
        echo
        echo "=== B7 lần $i/$LAN7: $DINH7 người mở app trong $RAMP7 s ==="
        mot_luot "b7_mo_app_lan$i" "$DINH7" "$RAMP7" $(( RAMP7 + GIU7 )) --xem-ky-ti-le "${B7_XEM_KY:-0.25}" || break
        [ "$i" -lt "$LAN7" ] && { echo "Nghỉ $CACH_NHAU s cho hệ thống hồi (đo bằng phiên nền)..."; sleep "$CACH_NHAU"; }
      done
    fi
    if [ "$PHIEN" -gt 0 ]; then
      wait "$PNEN"
      python3 "$TD/tong_hop.py" "$fp" --buoc 10 | tee "$KQ/${DAU}_b7_phien_nen.txt"
    fi
    echo "Đọc bảng CỬA SỔ TRƯỢT của phiên nền: sau mỗi đợt, p95 phải về mức nền trong ≤ 2 phút (B-SLA)."
    ;;
  b8)
    cat <<'HD'
B8 — hai nhánh cùng lúc. Không tự động hoá được trên một máy: hai nhánh dùng hai bộ máy phát.
  1. Máy phát MQTT:  BAC="<bậc cao nhất B2 còn đạt>" GIU=1800 ./loadtest/chay.sh mqtt-b2
  2. Máy phát HTTP:  B6_BAC="<bậc cao nhất B6 còn đạt>" ./loadtest/chay.sh b6
     (hoặc B5_BAC="<req/s cao nhất B5 còn đạt>" ./loadtest/chay.sh b5 k6)
  3. Đồng bộ đồng hồ hai máy (B1-06), ghi CPU/RAM/fd của TB, IBS, Postgres song song (B10 quy tắc 4).
  4. So trần từng nhánh khi nhánh kia đầy tải với trần khi chạy riêng → bảng "Cả hai cùng lúc".
Quy tắc "không chạy chồng" (B10 quy tắc 2) KHÔNG áp dụng cho B8 — chạy chồng là mục đích của bài.
HD
    ;;
  b9|6)
    khong_chong_bai; can_tai_khoan
    if ! curl -s -o /dev/null --max-time 5 http://localhost:3000; then
      echo "Không thấy app ở http://localhost:3000. Chạy 'npm run build && npm start' ở cửa sổ khác trước."
      exit 1
    fi
    if pgrep -fl "next dev" >/dev/null 2>&1; then
      echo "CẢNH BÁO: đang có 'next dev' chạy. B10 quy tắc 1: bài trình duyệt phải chạy bản PRODUCTION"
      echo "(npm run build && npm start) — bản dev bật StrictMode, mọi effect chạy hai lần."
      printf "Vẫn chạy? [y/N] "; read -r tl; case "$tl" in y|Y) ;; *) exit 1 ;; esac
    fi
    echo "Bài luồng chết âm thầm mất 70 giây, nhịp hỏi vòng ~60 giây, tab nền ~30 giây — đừng tưởng treo."
    python3 "$TD/kich_ban_6.py" --out "$KQ/${DAU}_b9.jsonl" "$@"
    echo
    echo "Thêm --cho-phep-bat-tat để chạy cả hai bài gửi lệnh thật (quạt sẽ bật tắt)."
    ;;
  mqtt-ca)
    "$TD/mqtt/tao_chung_thu.sh" "$@"
    ;;
  mqtt-b1)
    khong_chong_bai
    "$TD/mqtt/b1_bat_tay.sh" || exit 1
    echo
    echo "=== B1-02: trần MỘT máy phát MQTT ==="
    BAC="${B1_MQTT_BAC:-5000 10000 20000 40000 60000}" GIU="${B1_MQTT_GIU:-120}" TEN_BAI=b1_tran_may_phat \
      "$TD/mqtt/bac_ket_noi.sh"
    ;;
  mqtt-b2)  khong_chong_bai; "$TD/mqtt/bac_ket_noi.sh" ;;
  mqtt-b3a) khong_chong_bai; "$TD/mqtt/b3_bao_noi_lai.sh" a ;;
  mqtt-b3b) khong_chong_bai; "$TD/mqtt/b3_bao_noi_lai.sh" b ;;
  mqtt-b4)  khong_chong_bai; "$TD/mqtt/b4_telemetry.sh" ;;

  # ---- lệnh cũ (mã kịch bản bản 1), giữ để chạy lại được số đợt trước ----
  1)
    khong_chong_bai; can_tai_khoan; can_ulimit 4096
    xac_nhan_that "kịch bản 1 cũ — 100 rồi 300 phiên"
    mot_luot kb1_100  100  60  600 || exit 1
    mot_luot kb1_300  300 120  600 || exit 1
    echo
    echo "Trước lượt 1000 phiên: DEV là môi trường dùng chung, nên báo đội một câu."
    printf "Chạy lượt 1000 phiên? [y/N] "; read -r tl
    case "$tl" in y|Y) can_ulimit 16384; mot_luot kb1_1000 1000 300 900 ;; *) echo "Bỏ qua." ;; esac
    ;;
  2)
    khong_chong_bai; can_tai_khoan; can_ulimit 4096
    xac_nhan_that "kịch bản 2 cũ — 200 phiên × 2 giờ"
    mot_luot kb2_200 200 120 7200
    ;;
  3)
    khong_chong_bai; can_tai_khoan; can_ulimit 4096
    xac_nhan_that "kịch bản 3 cũ — 300 phiên, cắt kết nối ở giây 300"
    mot_luot kb3_300 300 60 900 --cut-at 300
    ;;
  8)
    khong_chong_bai; can_tai_khoan; can_ulimit 4096
    echo "Soak 12 giờ: tài liệu bản 3 đã BỎ bài này khỏi đợt này."
    xac_nhan_that "soak 200 phiên × 12 giờ"
    f="$KQ/${DAU}_kb8_qua_dem.jsonl"
    nohup python3 "$TD/do_phien.py" --sessions 200 --ramp 120 --duration 43200 \
      --out "$f" > "$KQ/${DAU}_kb8.log" 2>&1 &
    echo "Đã bật soak 12 giờ, PID $!."
    echo "Sáng mai đọc:  python3 $TD/tong_hop.py $f"
    echo "Muốn dừng sớm: kill $!   (file kết quả vẫn dùng được)"
    ;;
  *)
    sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
