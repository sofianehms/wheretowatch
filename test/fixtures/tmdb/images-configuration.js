// Format: https://developer.themoviedb.org/reference/configuration-details
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
export const headers = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': '*'
};
export default {
  images: {
    base_url: 'http://image.tmdb.org/t/p/',
    secure_base_url: 'https://image.tmdb.org/t/p/',
    backdrop_sizes: [ 'w300', 'w780', 'w1280', 'original' ],
    logo_sizes: [ 'w45', 'w92', 'w154', 'w185', 'w300', 'w500', 'original' ],
    poster_sizes: [ 'w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original' ],
    profile_sizes: [ 'w45', 'w185', 'h632', 'original' ],
    still_sizes: [ 'w92', 'w185', 'w300', 'original' ]
  },
  change_keys: [ 'title', 'name' ]
};
