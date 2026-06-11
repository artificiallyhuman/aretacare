"""
Client IP derivation for AretaCare API.

Resolves the real client IP behind the Cloudflare -> hosting-proxy chain.
Proxy-supplied headers are only honored when the request demonstrably
arrived through Cloudflare; otherwise the directly observed peer address
is used.
"""

import ipaddress
import logging

from fastapi import Request

logger = logging.getLogger(__name__)

# Cloudflare's published edge ranges (https://www.cloudflare.com/ips/).
# Re-sync this list if Cloudflare announces new ranges.
_CLOUDFLARE_CIDRS = [
    # IPv4 (https://www.cloudflare.com/ips-v4)
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
    # IPv6 (https://www.cloudflare.com/ips-v6)
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
]

_CLOUDFLARE_NETWORKS = [ipaddress.ip_network(cidr) for cidr in _CLOUDFLARE_CIDRS]


def _parse_ip(value: str):
    """Parse an IP literal, tolerating whitespace, brackets, and ports."""
    candidate = value.strip()
    if not candidate:
        return None
    if candidate.startswith("["):
        # [::1]:8080 or [::1]
        candidate = candidate[1:]
        bracket_end = candidate.find("]")
        if bracket_end != -1:
            candidate = candidate[:bracket_end]
    elif candidate.count(":") == 1:
        # IPv4 with port (a single colon can't be a valid IPv6 address)
        candidate = candidate.split(":")[0]
    try:
        return ipaddress.ip_address(candidate)
    except ValueError:
        return None


def _is_cloudflare(ip) -> bool:
    return any(ip in network for network in _CLOUDFLARE_NETWORKS)


def get_client_ip(request: Request) -> str:
    """Resolve the client IP for rate limiting and security logging.

    The rightmost X-Forwarded-For hop is appended by the hosting platform's
    own proxy from the actual TCP peer, so it can't be chosen by the caller.
    CF-Connecting-IP is only honored when that hop is a Cloudflare edge
    address; otherwise the edge hop itself is used.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        hops = [hop for hop in forwarded.split(",") if hop.strip()]
        if hops:
            edge_ip = _parse_ip(hops[-1])
            if edge_ip is not None:
                cf_ip = request.headers.get("CF-Connecting-IP")
                if cf_ip:
                    if _is_cloudflare(edge_ip):
                        return cf_ip.strip()
                    # Either a request that didn't transit Cloudflare, or
                    # Cloudflare published new ranges this list doesn't know.
                    logger.warning(
                        "CF-Connecting-IP present but edge hop %s is not a known "
                        "Cloudflare address; using edge hop. If this appears for "
                        "legitimate traffic, re-sync the Cloudflare IP ranges.",
                        edge_ip,
                    )
                return str(edge_ip)

    # No forwarding headers: direct connection (local dev, health checks)
    if request.client and request.client.host:
        return request.client.host
    return "unknown"
