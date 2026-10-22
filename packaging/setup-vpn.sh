#!/bin/bash
# Configure a private acceptance-testing peer on an Ubuntu provider host.
set -euo pipefail
umask 077
[[ "$(id -u)" == 0 ]] || { printf '%s\n' 'Run VPN setup as the host administrator.' >&2; exit 1; }
[[ "${WPK_VPN_CLIENT_PUBLIC_KEY:-}" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { printf '%s\n' 'Supply the development host WireGuard public key.' >&2; exit 1; }
[[ "${WPK_VPN_DOMAIN:-}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || { printf '%s\n' 'Supply the provider hostname without a scheme or path.' >&2; exit 1; }
if [[ -e /etc/wireguard/wg0.conf ]]; then
  printf '%s\n' 'Existing VPN configuration retained. Review it explicitly before changing peers.' >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get -o Acquire::Retries=5 update
apt-get -o Acquire::Retries=5 install -y wireguard-tools dnsmasq-base
install -d -m 700 /etc/wireguard
wg genkey > /etc/wireguard/provider.key
wg pubkey < /etc/wireguard/provider.key > /etc/wireguard/provider.pub
cat > /usr/local/sbin/wpk-vpn-firewall <<'FIREWALL'
#!/bin/bash
set -euo pipefail
if [[ "$1" == up ]]; then
  iptables -N WPK-VPN-INPUT
  iptables -A WPK-VPN-INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  iptables -A WPK-VPN-INPUT -d 10.66.0.1 -p udp --dport 53 -j ACCEPT
  iptables -A WPK-VPN-INPUT -d 10.66.0.1 -p tcp -m multiport --dports 53,443 -j ACCEPT
  iptables -A WPK-VPN-INPUT -j DROP
  iptables -I INPUT 1 -i wg0 -j WPK-VPN-INPUT
  iptables -N WPK-VPN-FORWARD
  iptables -A WPK-VPN-FORWARD -p tcp -m conntrack --ctorigdst 10.66.0.1 --ctorigdstport 443 -j RETURN
  iptables -A WPK-VPN-FORWARD -j DROP
  iptables -I DOCKER-USER 1 -i wg0 -j WPK-VPN-FORWARD
else
  iptables -D INPUT -i wg0 -j WPK-VPN-INPUT
  iptables -D DOCKER-USER -i wg0 -j WPK-VPN-FORWARD
  iptables -F WPK-VPN-INPUT
  iptables -X WPK-VPN-INPUT
  iptables -F WPK-VPN-FORWARD
  iptables -X WPK-VPN-FORWARD
fi
FIREWALL
chmod 700 /usr/local/sbin/wpk-vpn-firewall
{
  printf '[Interface]\nAddress = 10.66.0.1/24\nListenPort = 51820\nPrivateKey = '
  cat /etc/wireguard/provider.key
  printf '\nPostUp = /usr/local/sbin/wpk-vpn-firewall up\nPostDown = /usr/local/sbin/wpk-vpn-firewall down\n\n[Peer]\nPublicKey = %s\nAllowedIPs = 10.66.0.2/32\n' "$WPK_VPN_CLIENT_PUBLIC_KEY"
} > /etc/wireguard/wg0.conf
cat > /etc/wireguard/dns.conf <<DNS
interface=wg0
listen-address=10.66.0.1
bind-interfaces
no-resolv
server=169.254.169.253
address=/${WPK_VPN_DOMAIN}/10.66.0.1
user=nobody
group=nogroup
DNS
cat > /etc/systemd/system/wpk-vpn-dns.service <<'UNIT'
[Unit]
Description=Private provider testing DNS
After=wg-quick@wg0.service
Requires=wg-quick@wg0.service
[Service]
ExecStart=/usr/sbin/dnsmasq --keep-in-foreground --conf-file=/etc/wireguard/dns.conf
Restart=on-failure
[Install]
WantedBy=multi-user.target
UNIT
install -d -m 755 /etc/systemd/system/wg-quick@wg0.service.d
cat > /etc/systemd/system/wg-quick@wg0.service.d/provider.conf <<'ORDER'
[Unit]
After=docker.service
Requires=docker.service
ORDER
systemctl daemon-reload
systemctl enable --now wg-quick@wg0
systemctl enable --now wpk-vpn-dns
printf '%s\n' 'VPN listener and private DNS started. Server public key: /etc/wireguard/provider.pub. Private keys stay on their respective devices.'
