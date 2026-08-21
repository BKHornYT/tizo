"""Widens yt-dlp's KVS detection, which is narrower than its decoder.

KVS (Kernel Video Sharing) is off-the-shelf tube-site software behind a large
number of sites. yt-dlp already implements the whole thing — `_extract_kvs` reads
the player config, resolves the obfuscated `video_url` and returns formats. The
only problem is finding the config: it looks for a `flashvars = {` assignment,
and some deployments declare the identical object another way, so extraction
fails with "Unable to extract flashvars" while every field it needs is present.

Implemented as an *override* of the generic extractor rather than as a new one.
Two reasons:

  - Generic recognises the KVS markers and raises before webpage-level plugins
    are consulted, so a plugin that only contributes to that pass never runs.
  - A plugin claiming `/video/<id>` on any host would take over pages generic
    already handles, turning a miss into a hard failure.

Overriding one method changes detection and nothing else: when the standard
declaration is absent, the config is located and appended in the shape yt-dlp
expects, then yt-dlp's own code does all the work. No decoding here.
"""

import re

from yt_dlp.extractor.generic import GenericIE as _GenericIE


def _config_body(webpage):
    """The player config object's contents, however it was declared.

    Found by walking outwards from `license_code` to the enclosing braces rather
    than by matching a declaration — the declaration is precisely the part that
    varies between deployments, so matching it is what fails in the first place.
    """
    anchor = webpage.find('license_code')
    if anchor < 0:
        return None

    start = webpage.rfind('{', 0, anchor)
    if start < 0:
        return None

    depth = 0
    for index in range(start, min(len(webpage), start + 200_000)):
        char = webpage[index]
        if char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                body = webpage[start + 1:index]
                # The two fields yt-dlp actually needs. Without both this is some
                # other object that merely mentions a licence.
                if 'video_url' in body and 'license_code' in body:
                    return body
                return None
    return None


class GenericIE(_GenericIE):
    """Same name and a subclass, which is how yt-dlp replaces a built-in."""

    _PLUGIN_NAME = 'kvs-detection'

    def _extract_kvs(self, url, webpage, video_id):
        if not re.search(r'flashvars\s*=\s*\{', webpage):
            body = _config_body(webpage)
            if body:
                webpage = f'{webpage}\n<script>var flashvars = {{{body}}};</script>'
        return super()._extract_kvs(url, webpage, video_id)
