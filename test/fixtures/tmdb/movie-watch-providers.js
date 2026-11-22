// Format: https://developer.themoviedb.org/reference/movie-watch-providers
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
export const headers = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': '*'
};
export default {
  id: 900001,
  results: {
    US: {
      link: 'https://www.themoviedb.org/movie/900001/watch?locale=US',
      flatrate: [
        {
          provider_id: 8,
          provider_name: 'Netflix',
          logo_path: '/synthetic-netflix.png',
          display_priority: 0
        }
      ],
      ads: [
        {
          provider_id: 9901,
          provider_name: 'Lantern Screen',
          logo_path: '/lantern-screen.png',
          display_priority: 1
        }
      ],
      rent: [
        {
          provider_id: 9902,
          provider_name: 'Pebble Cinema',
          logo_path: '/pebble-cinema.png',
          display_priority: 2
        }
      ],
      buy: [
        {
          provider_id: 9902,
          provider_name: 'Pebble Cinema',
          logo_path: '/pebble-cinema.png',
          display_priority: 2
        }
      ]
    },
    FR: {
      link: 'https://www.themoviedb.org/movie/900001/watch?locale=FR',
      flatrate: [
        {
          provider_id: 8,
          provider_name: 'Netflix',
          logo_path: '/synthetic-netflix.png',
          display_priority: 0
        }
      ]
    }
  }
};
