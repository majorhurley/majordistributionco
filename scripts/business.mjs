// The business entity every page describes in JSON-LD. One source, so the
// homepage, /work, services and case studies can't drift apart, and so it can
// match the Google Business Profile word for word.
//
// Service-area business (Boss, 2026-11-09): no street address, no phone. The
// area comes from where the client work actually is: home base La Verne
// (Cafe Wang, ULV), Los Angeles (Amor), Santa Ana + Tustin (Golden Vision).
export const AREAS = ['La Verne', 'Pomona', 'Claremont', 'San Dimas', 'Los Angeles', 'Santa Ana', 'Tustin'];
export const REGIONS = ['San Gabriel Valley', 'Los Angeles County', 'Orange County'];

export const businessId = (site) => `${site}/#business`;

export const areaServed = () => [
  ...AREAS.map((name) => ({ '@type': 'City', name: `${name}, CA` })),
  ...REGIONS.map((name) => ({ '@type': 'AdministrativeArea', name: `${name}, CA` })),
];

export const business = (site) => ({
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  '@id': businessId(site),
  name: 'Major Distribution',
  url: site,
  logo: `${site}/assets/brand/md-wordmark.png`,
  image: `${site}/assets/brand/og-default.png`,
  slogan: "Can't buy what you can't see.",
  description: 'Marketing media for local businesses: video ads, product photography, social media management and websites.',
  founder: { '@type': 'Person', name: 'Major Hurley' },
  areaServed: areaServed(),
  knowsAbout: ['Video advertising', 'Meta ads', 'Product photography', 'Social media management', 'Web design', 'E-commerce'],
});
