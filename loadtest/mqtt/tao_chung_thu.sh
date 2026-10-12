#!/usr/bin/env bash
# Sinh CA TEST + một lô chứng thư client RSA-2048 cho máy phát MQTT (mục 1.1d, câu 9).
#
#   SO=1000 ./loadtest/mqtt/tao_chung_thu.sh                 sinh lt0 … lt999
#   SO=100000 BAT_DAU=0 SONG_SONG=16 ./loadtest/mqtt/tao_chung_thu.sh
#   ./loadtest/mqtt/tao_chung_thu.sh --xoa                    xoá sạch thư mục chứng thư (B10 quy tắc 8)
#
# ⚠️ ĐÂY LÀ CA TEST RIÊNG, KHÔNG đi qua sadmin / PKI thật, KHÔNG dùng cho sản xuất.
#    Cấp qua sadmin tối đa 500 mạch/lô, duyệt tuần tự — 100.000 chứng thư là 200 lô (câu 9),
#    nên máy phát dùng CA test riêng.
#
# Mỗi chứng thư: khoá RSA-2048 (đúng loại khoá production, câu 3), CN = serial = clientId
# = <TIEN_TO><số>, extendedKeyUsage = clientAuth, ký bởi CA test, sống HAN ngày.
#
# Việc PHẢI LÀM RIÊNG, script này KHÔNG làm (không gọi ThingsBoard, không gọi IBS):
#   1. Nạp ca-test.crt vào ThingsBoard làm CA tin cậy (device profile "X.509 Certificates chain"),
#      hoặc đăng ký từng thiết bị với credentials X509 = PEM chứng thư (danh-sach.csv có đường dẫn).
#   2. Sau bài: XOÁ danh tính khỏi ThingsBoard, gỡ CA test khỏi device profile, rồi --xoa ở đây.
#      1 triệu bản ghi rác trong ThingsBoard làm sai mọi bài sau (B10 quy tắc 8). Đĩa TB DEV
#      đã gần đầy (mục 0.2) — tính trước dung lượng.
#
# Khoá riêng nằm trong THU_MUC (mặc định loadtest/mqtt/chung-thu/, đã có trong .gitignore).
# Không commit, không gửi đi đâu.

set -eu
TD="$(cd "$(dirname "$0")" && pwd)"
THU_MUC=${THU_MUC:-$TD/chung-thu}
SO=${SO:-1000}
BAT_DAU=${BAT_DAU:-0}
TIEN_TO=${TIEN_TO:-${MQTT_PREFIX:-lt}}
HAN=${HAN:-30}
SONG_SONG=${SONG_SONG:-$( (nproc || sysctl -n hw.ncpu) 2>/dev/null || echo 4)}

if [ "${1:-}" = "--xoa" ]; then
  [ -d "$THU_MUC" ] || { echo "Không có $THU_MUC"; exit 0; }
  echo "Xoá $(find "$THU_MUC" -name '*.crt' | wc -l | tr -d ' ') chứng thư và khoá trong $THU_MUC."
  echo "Nhớ: danh tính trong ThingsBoard phải xoá RIÊNG (script này không đụng TB)."
  printf "Gõ 'xoa' để xác nhận: "; read -r tl
  [ "$tl" = "xoa" ] && rm -rf "$THU_MUC" && echo "Đã xoá."
  exit 0
fi

command -v openssl >/dev/null || { echo "Thiếu openssl."; exit 2; }
mkdir -p "$THU_MUC"
chmod 700 "$THU_MUC"
cd "$THU_MUC"

if [ ! -f ca-test.key ]; then
  echo "Tạo CA TEST (RSA-2048, $HAN ngày)…"
  openssl req -x509 -newkey rsa:2048 -nodes -keyout ca-test.key -out ca-test.crt -days "$HAN" \
    -subj "/O=Livotec LOADTEST/CN=Livotec LOADTEST CA - KHONG DUNG CHO SAN XUAT" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  chmod 600 ca-test.key
fi
printf 'extendedKeyUsage=clientAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\n' > ext.cnf

mot() {  # mot <số>
  local id="$TIEN_TO$1"
  [ -f "$id.crt" ] && return 0
  openssl req -newkey rsa:2048 -nodes -keyout "$id.key" -subj "/CN=$id" -out "$id.csr" 2>/dev/null
  openssl x509 -req -in "$id.csr" -CA ca-test.crt -CAkey ca-test.key -set_serial "0x$(openssl rand -hex 8)" \
    -days "$HAN" -extfile ext.cnf -out "$id.crt" 2>/dev/null
  rm -f "$id.csr"
  chmod 600 "$id.key"
}
export -f mot
export TIEN_TO HAN

echo "Sinh $SO chứng thư client ${TIEN_TO}${BAT_DAU} … ${TIEN_TO}$(( BAT_DAU + SO - 1 )), $SONG_SONG luồng song song…"
T0=$(date +%s)
seq "$BAT_DAU" $(( BAT_DAU + SO - 1 )) | xargs -P "$SONG_SONG" -I{} bash -c 'mot {}'
T1=$(date +%s)

echo "serial,chung_thu,sha256" > danh-sach.csv
for i in $(seq "$BAT_DAU" $(( BAT_DAU + SO - 1 ))); do
  id="$TIEN_TO$i"
  fp=$(openssl x509 -in "$id.crt" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':')
  echo "$id,$THU_MUC/$id.crt,$fp" >> danh-sach.csv
done
echo "Xong sau $(( T1 - T0 )) giây. CA: $THU_MUC/ca-test.crt · danh sách: $THU_MUC/danh-sach.csv"
echo "Kiểm một chứng thư:  openssl verify -CAfile $THU_MUC/ca-test.crt $THU_MUC/${TIEN_TO}${BAT_DAU}.crt"
echo "CHƯA đăng ký vào ThingsBoard — xem đầu tệp này, bước 1 và 2."
