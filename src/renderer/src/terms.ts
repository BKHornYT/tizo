/**
 * The terms shown on first run.
 *
 * Written to be read, not skipped: short sections, plain words, and the two
 * things a person actually needs to know up front — that what they download is
 * their responsibility, and exactly what the app sends back.
 */
export const terms = {
  title: 'Before you start',
  intro:
    'Two short things to agree to. No lawyer wrote this, and it is meant to be read.',

  sections: [
    {
      heading: 'What Tizo does',
      body: [
        'Tizo downloads video and audio from around 1800 websites using yt-dlp, an open-source tool. It saves files to your computer. That is the whole product.',
        'It is provided as-is, with no warranty. Sites change constantly and some downloads will fail.'
      ]
    },
    {
      heading: 'What you download is your responsibility',
      body: [
        'Downloading is legal in many situations — your own uploads, public-domain works, Creative Commons material, and in some countries a personal copy of something you can already access.',
        'It is not legal in all of them. Copyrighted material, paid content and many sites’ terms of service say otherwise, and that varies by country and by site.',
        'Tizo does not check, and cannot check. Deciding what you are allowed to download is on you, not on this app or the person who made it.'
      ]
    },
    {
      heading: 'What gets sent back',
      body: [
        'Two things, and nothing else:',
        '• A count of downloads per website, like "youtube.com: 12". No links, no titles, no file names, and no identifier attached.',
        '• A random ID for this installation, so we can tell how many computers use Tizo. It carries no download data at all.',
        'These are sent separately and share nothing in common, so they cannot be matched up. We can see how many machines exist and which sites are popular. We cannot see what any particular machine downloaded.',
        'Nothing else leaves your computer. No account, no name, no email, no browsing history, no file paths.',
        'You can turn this off any time in Options, and the app works exactly the same either way.'
      ]
    }
  ],

  agree: 'I understand and agree',
  decline: 'Quit',
  reviewLater: 'These terms stay available in Options.'
} as const
