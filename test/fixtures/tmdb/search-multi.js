// Format: https://developer.themoviedb.org/reference/search-multi
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
const titleFields = {
  adult: false,
  backdrop_path: null,
  genre_ids: [],
  original_language: 'en',
  overview: 'A signal interrupts a quiet afternoon.',
  popularity: 0.3,
  vote_average: 0,
  vote_count: 0
};

const movie = {
  ...titleFields,
  id: 900001,
  title: 'The Glass Orchard',
  original_title: 'The Glass Orchard',
  release_date: '2024-05-10',
  poster_path: '/glass-orchard.jpg',
  media_type: 'movie',
  softcore: false,
  video: false
};

const series = {
  ...titleFields,
  origin_country: ['US'],
  id: 900002,
  name: 'Signal Garden',
  original_name: 'Signal Garden',
  first_air_date: '2025-02-14',
  poster_path: null,
  media_type: 'tv'
};

const person = {
  id: 900004,
  name: 'Iona Vale',
  media_type: 'person',
  profile_path: null,
  adult: false,
  gender: 0,
  popularity: 0.2,
  known_for_department: 'Acting',
  known_for: [movie, series]
};

const secondPerson = {
  ...person,
  id: 900005,
  name: 'Rowan Flint',
  profile_path: '/rowan-flint.jpg',
  known_for_department: 'Directing',
  known_for: [movie]
};

const additionalMovies = [
  'Orchard Below', 'Glass at Dawn', 'Signal at Noon',
  'Garden After Rain', 'The Quiet Relay', 'Lantern Hill'
].map((title, index) => ({
  ...movie,
  id: 900010 + index,
  title,
  original_title: title,
  poster_path: null
}));

export const headers = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': '*'
};
export default {
  page: 1,
  results: [movie, person, series, ...additionalMovies, secondPerson],
  total_pages: 1,
  total_results: 10
};
