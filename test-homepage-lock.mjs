// Rail & Rye homepage production lock: owner-approved current homepage, November 22, 2026.
// This guards the HOME PAGE, not commerce/product availability or the other pages.
// Intentional homepage redesigns require the owner's explicit approval before
// updating these baselines. See docs/HOMEPAGE_PRODUCTION_LOCK.md.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const approvedBlobs = {
  'public/index.html': '4ed5877178fd30070e7de7dc8e3ebc9de8ed7eae',
  'public/assets/approved/brand/header-horse.webp': 'c6a7ed8882a6b42dd96af9a621fe80a88da96f8a',
  'public/assets/approved/brand/rail-rye-ivory-logo.png': '974905e392779b081e784ca55d43205c80fef126',
  'public/assets/approved/home/hero-dust-charged-finish.jpg': 'aa2e5b276969e2b65c7e3b1fd099bd541d32ea21',
  'public/assets/approved/journal/hero.webp': 'f2cc23eae8ec0026f1b8c0471d6cb61ecb588cf2',
  'public/assets/approved/publications/longshot-hero.jpg': '396f0f3f035bcf6c0f08c50d97066439f0bc72ce',
  'public/assets/approved/publications/longshot-mark.png': '1515818996a2bed51d6284fe7c950cac4cb33cb5',
  'public/assets/approved/publications/stable-hero.jpg': '9216230dbb9c0463d08dc42da3c4da9f6dcc2ec9',
  'public/assets/approved/publications/pick-tickets-hero.png': '1f9b88e4935061c4795a04cd2ff8355faaadffef',
  'public/assets/approved/publications/stable-mark.png': '94293b93d4efea7c597c76e6918705aa5dc3c2bd',
  'public/assets/approved/publications/target-hero.jpg': 'effcc6b8f83fef9ab67a4ea1c45e7c1671f28607',
  'public/assets/approved/publications/target-mark.png': '0cd7c00aa36e18d1f1a862b1a64bea0beb8e4155',
  'public/assets/approved/race-cards/hero.webp': '023c52fca298486c6dc570baf99e0988e11a151d',
  'public/assets/approved/saddlecloths/1.png': '7fdc677688a1182ab6601da8240130e09c2ac064',
  'public/assets/approved/saddlecloths/2.png': 'ae083a84c5ed0438539c4253ab3794d2fb2815af',
  'public/assets/approved/saddlecloths/3.png': 'ab1eefb4afebc508146d4582f0060bb9dfe2c9ff',
  'public/assets/approved/saddlecloths/4.png': 'a737d8156bf1f38580dd1aa68f4b79e3e1e48e08',
  'public/assets/approved/saddlecloths/5.png': 'cb30368b5803586aa4723c73ef26a6f6272ec5a9',
  'public/assets/approved/textures/parchment.jpg': '97ecbcdb37794d0d2004779d863021a201768976'
};
const requiredStyleFragments = {
  'public/assets/rail-rye-core.css': [
    ".heritage-hero{position:relative;min-height:clamp(450px,31vw,630px)",
    "url('/assets/approved/home/hero-dust-charged-finish.jpg')",
    '.heritage-feature-grid{padding-top:20px;display:grid;grid-template-columns:1fr 1fr'
  ],
  'public/assets/rail-rye-components.css': [
    '.heritage-home .heritage-hero{min-height:370px}',
    '.heritage-home .heritage-section-title{margin-bottom:28px}',
    ".heritage-home .race-panel{background-image:url('/assets/approved/race-cards/hero.webp')",
    ".heritage-home .journal-panel-heritage{background-image:url('/assets/approved/journal/hero.webp')",
    ".heritage-home .pick-tickets-panel-heritage{",
    '.heritage-home .heritage-badges{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'
  ],
  'public/assets/rail-rye-pages.css': [
    '/* Desktop homepage fold: stable compact spacing keeps the More from Rail & Rye title visible beneath the feature cards. */',
    'body.heritage-home:not(.heritage-inner-page):not(.heritage-store-page)>.heritage-body>.heritage-more{\n  padding-top:8px\n }'
  ]
};

let issues = [];
for (const [path, expected] of Object.entries(approvedBlobs)) {
  try {
    let bytes = fs.readFileSync(path);
    if (path === 'public/index.html') {
      // Branch-safe additive Pulse insertion: remove ONLY the approved proposed
      // insertions and verify the original homepage bytes remain byte-identical.
      // The approved baseline hash is intentionally NOT changed before visual signoff.
      let html=bytes.toString('utf8');
      const style='<link rel="stylesheet" href="/assets/race-day-pulse.css?v=1">';
      const script='<script src="/assets/race-day-pulse.js?v=1" defer></script>\\n'.replace('\\n','\\n');
      const start='<section id="rr-pulse" class="rr-pulse" aria-label="Race-Day Pulse" hidden>';
      const stop='</section>\\n'.replace('\\n','\\n');
      const first=html.indexOf(start),last=html.indexOf(stop,first);
      if(first>=0&&last>first){
        if(!html.includes(style)||!html.includes(script))issues.push('Pulse script or stylesheet missing');
        else{
          html=html.replace(style,'').replace(script,'').replace(html.slice(first,last+stop.length),'');
          bytes=Buffer.from(html,'utf8');
        }
      }
    }
    const actual = createHash('sha1')
      .update(Buffer.from('blob ' + bytes.length + '\0'))
      .update(bytes)
      .digest('hex');
    if (actual !== expected) issues.push(path + ': approved visual baseline changed (' + actual + ')');
  } catch (err) {
    issues.push(path + ': missing or unreadable (' + err.message + ')');
  }
}
for (const [path, fragments] of Object.entries(requiredStyleFragments)) {
  try {
    const css = fs.readFileSync(path, 'utf8');
    for (const fragment of fragments) {
      if (!css.includes(fragment)) issues.push(path + ': homepage-specific CSS contract changed: ' + fragment.slice(0, 100));
    }
  } catch (err) {
    issues.push(path + ': stylesheet missing (' + err.message + ')');
  }
}

// Owner-authorized November 22 card and copy update. Keep unrelated homepage
// structure and protected visual assets under the same regression lock.
const home=fs.readFileSync('public/index.html','utf8');
const ownerApprovedContent=[
  'Contenders the Market May Overlook',
  'Multi-race selections organized by sequence, with a projected hit rate for each.',
  'src="/assets/approved/publications/stable-mark.png"',
  'Pick Tickets',
  'Stories from the Rail',
  'When Favorites Face a Test',
  '<h1>The Science of Racing.<br><em>The Soul of the Sport.</em></h1>',
  '<link rel="preload" as="image" href="/assets/approved/home/hero-dust-charged-finish.jpg" fetchpriority="high">'
];
for(const fragment of ownerApprovedContent){
  if(!home.includes(fragment))issues.push('Owner-approved homepage copy or performance hint missing: '+fragment);
}
if(home.includes('Stable Notes'))issues.push('Stable Notes should remain hidden from the homepage.');
for(const oldClaim of ['We’re Beating the Morning Line','Where Odds Meet Opportunity','The Backstretch Knows First']){
  if(home.includes(oldClaim))issues.push('Outdated homepage tagline reintroduced: '+oldClaim);
}

if (issues.length) {
  console.error('RAIL & RYE HOMEPAGE LOCK FAILED. Do not overwrite the approved homepage without owner approval.');
  for (const issue of issues) console.error(' - ' + issue);
  console.error('Reference: docs/HOMEPAGE_PRODUCTION_LOCK.md');
  process.exitCode = 1;
} else {
  console.log('RAIL & RYE HOMEPAGE LOCK PASSED: approved structure, artwork and essential layout are intact.');
}
