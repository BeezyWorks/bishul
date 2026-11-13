/** Privacy policy and deletion copy. Kept as data so the route files stay pure composition. */

export const SUPPORT_EMAIL = 'mattaniah@beezyworks.com'
export const PRIVACY_UPDATED = 'November 13, 2026'

export interface LegalSection {
  title: string
  paragraphs: string[]
}

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: 'Who we are',
    paragraphs: [
      'Tavshil is a recipe, household and meal-planning app for kosher families, made by BeezyWorks. This policy covers the Tavshil app and website at tavshil.baderech.app.',
    ],
  },
  {
    title: 'What we collect',
    paragraphs: [
      'Your account: your name and email address, and which sign-in you use (email and password, Sign in with Apple, or Google). Accounts are run by BeezyWorks Accounts at auth.baderech.app, which also keeps session information such as IP address and device type.',
      'What you put in the app: your household (name and location, used for the Hebrew calendar and candle-lighting times), the people in it and their dietary constraints, which can include allergies, kashrut customs and dislikes; guests and contacts you add; recipes and versions; menus and meal plans; notes; the shopping list; use-soon items; kitchen equipment; and your display settings.',
      'Dietary constraints, and especially allergies, can be health-related. We use them only to check dishes for you and never for advertising.',
      'Timers: cooking timers and their alerts are set on your device. Tavshil does not send timer data to a server.',
      'We do not collect precise location in the background, contacts from your device, photos, advertising identifiers or analytics about how you use the app.',
    ],
  },
  {
    title: 'How we use it',
    paragraphs: [
      'To run the app: sign you in, store and show your recipes, plans and guests, check dishes against who is coming, and build your shopping list and prep schedule. We do not sell your data, share it for advertising, or track you across other apps and websites.',
    ],
  },
  {
    title: 'Your AI',
    paragraphs: [
      'Tavshil can connect to the AI assistant you choose, through an MCP connection or an API key. When you connect one, that assistant can read and change your Tavshil data, so it receives what it asks for. What it does with that data is governed by its own provider’s terms and privacy policy. You can disconnect an assistant or revoke an API key at any time in Settings.',
    ],
  },
  {
    title: 'Sharing',
    paragraphs: [
      'Nothing is shared unless you share it. A recipe link or public recipe can be opened by anyone who has the link, or by anyone for a public recipe, without an account. A public recipe shows your name as its author unless you made it anonymous. Profile links show what you chose to share on that person. You can revoke a link or unpublish a recipe at any time.',
      'If you add a guest and link them to someone’s real profile, you see what that person entered about themselves. Your own notes and additions about them stay private to your household.',
    ],
  },
  {
    title: 'Who else handles your data',
    paragraphs: [
      'Cloudflare hosts the app and its database. Apple or Google handle sign-in if you use them. Resend delivers account emails such as confirmation and password reset. These providers process data only to provide those services to us.',
    ],
  },
  {
    title: 'Keeping and deleting your data',
    paragraphs: [
      'You can delete your account and data at any time from Settings, Account, Delete account, or on the web at tavshil.baderech.app/delete-account. You can also email us and we will do it for you.',
      'Deleting removes your login and your profile details, revokes your API keys, links and invites, and retires your household’s recipes, guests, plans and lists so they can no longer be opened. If you share a household with other people, it stays with them and ownership passes to the member who has been there longest; recipes you wrote stay in that household. Recipes you published as public stay available, with no author name. If someone had linked you to a contact, what you entered about yourself is erased from it.',
      'Deleted data is held for 30 days, then erased from our database for good by a routine job that runs every day. Database backups kept by our hosting provider expire on their own schedule after that.',
    ],
  },
  {
    title: 'Children',
    paragraphs: [
      'Tavshil is for adults. Parents can add their children as people in the household to track dietary needs; those profiles belong to the parent’s account, and children do not sign in.',
    ],
  },
  {
    title: 'Safety notice',
    paragraphs: [
      'Tavshil helps you avoid serving the wrong thing, but it cannot guarantee a dish is safe. It’s on the host: always confirm allergies with your guests.',
    ],
  },
  {
    title: 'Changes and contact',
    paragraphs: [
      'If we change this policy we will update the date above and, for material changes, tell you in the app. Questions or requests: ' +
        SUPPORT_EMAIL +
        '.',
    ],
  },
]

export const ABOUT_PARAGRAPHS: string[] = [
  'Tavshil is a recipe, household and meal-planning app for kosher families. Tell it who is coming to Shabbat, pick the dishes, and it checks every dish against every guest: allergies, chalav Yisrael, kitniyot and other customs. It also builds your shopping list and prep schedule, and walks you through cooking with timers.',
  'Tavshil is built to be used through your own AI assistant. Connect one in Settings and just ask for what you need.',
  'Tavshil is made by BeezyWorks.',
]

export const DELETE_EFFECTS: string[] = [
  'Your login, name and email are removed.',
  'Your API keys are revoked and your AI connections stop working.',
  'Your recipes, guests, plans, notes and lists are retired and can no longer be opened.',
  'Recipe links and invites you created stop working.',
  'If you share a household, it stays with the others and ownership passes to the longest-standing member. Recipes you wrote stay in that household.',
  'Recipes you made public stay available, with no author name.',
  'After 30 days it is erased for good, and you can’t get it back.',
]
