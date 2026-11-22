// Format: https://developer.themoviedb.org/reference/watch-providers-available-regions
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
export const headers = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': '*'
};
// Fill the observed list size with placeholders, independent of the live catalog.
const syntheticRegions = Array.from({ length: 137 }, (_, index) => {
  const firstLetter = String.fromCharCode(65 + Math.floor(index / 26));
  const secondLetter = String.fromCharCode(65 + index % 26);
  const name = 'Fixture Region ' + (index + 1);
  return { iso_3166_1: firstLetter + secondLetter, english_name: name, native_name: name };
});

export default {
  results: [
    { iso_3166_1: 'FR', english_name: 'France', native_name: 'France' },
    {
      iso_3166_1: 'US',
      english_name: 'United States of America',
      native_name: 'United States'
    },
    ...syntheticRegions
  ]
};
