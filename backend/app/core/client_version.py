"""Which iOS build a request came from, for server controls that wait on an App Store release.

iOS 1.0.9 and later send `X-App-Version`; earlier builds send nothing. The web client ships
with the server and sends neither header. Callers can set these headers freely, so they
must only ever *relax* a control for builds that cannot cope with it, never grant access,
and every such exemption needs a way to end (a setting, or a note saying when to delete it).
"""


def parse_app_version(value):
    """'2.0.0' -> (2, 0, 0); None for a missing or malformed value."""
    try:
        return tuple(int(part) for part in (value or "").strip().split("."))
    except ValueError:
        return None


def is_ios_build_below(headers, minimum):
    """True for an iOS request from a build older than `minimum` (a version tuple).

    `headers` is any mapping with `.get` (a Starlette `request.headers`). A missing or
    malformed version counts as old: builds before 1.0.9 send none.
    """
    if (headers.get("X-Client-Type") or "").lower() != "ios":
        return False
    version = parse_app_version(headers.get("X-App-Version"))
    return version is None or version < minimum
