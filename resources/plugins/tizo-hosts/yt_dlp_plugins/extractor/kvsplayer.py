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

**The `plugin_name=` class keyword is load-bearing — do not turn it into a
plain attribute.** It is the whole difference between overriding generic and
replacing every extractor in yt-dlp. With it, `InfoExtractor.__init_subclass__`
swaps this class in for `GenericIE` *inside its own module*, so the extractor
list keeps the order it builds deliberately -- YouTube first, generic last as
the fallback -- and marks the class with `PLUGIN_NAME` so the plugin loader does
not also register it as a new extractor.

Without it, none of that happens: the class is collected as an ordinary plugin
extractor and plugin extractors are *prepended* to the lookup, where the
`_VALID_URL = r'.*'` inherited from generic matches every URL ever passed in. It
is then first and always suitable, so no named extractor is ever reached. That
shipped in v0.0.11 and v0.0.12 as `_PLUGIN_NAME` -- an attribute yt-dlp does not
read -- and cost every one of the ~1745 built-in extractors, YouTube included.
Guarded now by `npm run test:plugins`.
"""

import re

from yt_dlp.extractor.generic import GenericIE as _GenericIE


# The exact prefix yt-dlp searches for. Asking the question yt-dlp's own way is
# the point: this guard predicts whether the built-in lookup is about to
# succeed, and a looser pattern gets that wrong in both directions. It skips the
# widening on a page that merely mentions the declaration in a comment or a
# stray string -- the fixture tripped exactly that -- and it fires needlessly on
# one where the text appears outside any <script>.
_DECLARED = re.compile(r'(?s)<script\b[^>]*>.*?var\s+flashvars\s*=')


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


class GenericIE(_GenericIE, plugin_name='kvs-detection'):
    """Subclass generic and hand yt-dlp the override keyword. See the module
    docstring: the keyword is what makes this an override instead of a new
    extractor that shadows all the others."""

    def _extract_kvs(self, url, webpage, video_id):
        if not _DECLARED.search(webpage):
            body = _config_body(webpage)
            if body:
                webpage = f'{webpage}\n<script>var flashvars = {{{body}}};</script>'
        return super()._extract_kvs(url, webpage, video_id)
