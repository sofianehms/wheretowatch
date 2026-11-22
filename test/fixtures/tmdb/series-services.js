// Format: https://developer.themoviedb.org/reference/watch-providers-tv-list
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
      provider_id: 9901,
      provider_name: 'Lantern Screen',
      logo_path: '/lantern-screen.png',
      display_priorities: { FR: 1 },
      display_priority: 1
    }
  ]
};
