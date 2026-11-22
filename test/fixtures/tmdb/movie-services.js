// Format: https://developer.themoviedb.org/reference/watch-providers-movie-list
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
export const headers = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': '*'
};
export default {
  results: [
    {
      provider_id: 8,
      provider_name: 'Netflix',
      logo_path: '/synthetic-netflix.png',
      display_priorities: { FR: 0, US: 0 },
      display_priority: 0
    },
    {
      provider_id: 9902,
      provider_name: 'Pebble Cinema',
      logo_path: '/pebble-cinema.png',
      display_priorities: { FR: 1 },
      display_priority: 1
    }
  ]
};
