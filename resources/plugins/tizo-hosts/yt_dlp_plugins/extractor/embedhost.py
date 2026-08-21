"""Extractor for a family of embed hosts.

These hosts share one flow, and the app cannot read them without it: the embed
page contains no source at all. Its player fetches a short-lived path from a
`/pass_md5/` endpoint, appends random characters plus a token and an expiry, and
plays the result from a CDN node. Nothing about that is visible to a page scan,
and watching a real browser does not help either — the embed page sits behind a
bot challenge that never clears under automation.

Talking to the endpoint the player talks to sidesteps all of it.

Mirror domains are the norm for this family: the same software is served from a
rotating set of hostnames, so `_VALID_URL` matches the *shape* rather than a
fixed list, and new mirrors keep working without a change here.
"""

import random
import re
import string
import time

from yt_dlp.extractor.common import InfoExtractor
from yt_dlp.utils import ExtractorError


class EmbedHostIE(InfoExtractor):
    IE_NAME = 'embedhost'
    _VALID_URL = r'https?://(?P<host>[^/]+)/(?:e|d)/(?P<id>[a-z0-9]{8,})'
    # Only claim a URL once the page proves it is this software; a bare
    # `/e/<id>` shape is far too common to take on sight.
    _WEBPAGE_TESTS = []

    def _real_extract(self, url):
        host, video_id = self._match_valid_url(url).group('host', 'id')

        webpage = self._download_webpage(
            url, video_id, note='Downloading embed page',
            headers={'Referer': f'https://{host}/'})

        # The identifying marker. If it is absent this is not this software, and
        # claiming the URL anyway would break unrelated sites sharing the shape.
        pass_path = self._search_regex(
            r'''\$\.get\(\s*['"](/pass_md5/[^'"]+)['"]''', webpage, 'pass_md5 path',
            default=None)
        if not pass_path:
            raise ExtractorError('Not a page this extractor handles', expected=True)

        token = self._search_regex(
            r'''cookieIndex\s*=\s*['"]([^'"]+)['"]''', webpage, 'token', default=None)
        if not token:
            # Some builds put the token at the end of the pass_md5 path instead.
            token = pass_path.rstrip('/').rsplit('/', 1)[-1]

        base = self._download_webpage(
            f'https://{host}{pass_path}', video_id, note='Resolving media path',
            headers={'Referer': url}).strip()

        if not base.startswith('http'):
            raise ExtractorError('Media path endpoint returned no URL', expected=True)

        # The player appends ten random characters, a token and a millisecond
        # expiry. The randomness is not a signature — it is cache-busting — but
        # the shape is checked, so it has to be there.
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
        media_url = f'{base}{suffix}?token={token}&expiry={int(time.time() * 1000)}'

        title = self._html_search_regex(
            r'<title>([^<]+)</title>', webpage, 'title', default=video_id)
        title = re.sub(r'\s*[-|]\s*[^-|]*$', '', title).strip() or video_id

        return {
            'id': video_id,
            'title': title,
            'url': media_url,
            'ext': 'mp4',
            # The CDN rejects a request that arrives without the embed page.
            'http_headers': {'Referer': f'https://{host}/'},
        }
