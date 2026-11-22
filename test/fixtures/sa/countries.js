// Format: Streaming Availability API v4, https://developers.movieofthenight.com/
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
import { responseHeaders } from './response-headers.js';

export const headers = responseHeaders(21);

export const netflix = {
  id: 'netflix',
  name: 'Netflix',
  homePage: 'https://www.netflix.com/',
  themeColorCode: 'black',
  imageSet: {
    lightThemeImage: 'https://media.example/netflix-light.svg',
    darkThemeImage: 'https://media.example/netflix-dark.svg',
    whiteImage: 'https://media.example/netflix-white.svg'
  }
};

export const lantern = {
  id: 'lantern',
  name: 'Lantern Screen',
  homePage: 'https://lantern.example/',
  themeColorCode: 'slategray',
  imageSet: {
    lightThemeImage: 'https://media.example/lantern-light.svg',
    darkThemeImage: 'https://media.example/lantern-dark.svg',
    whiteImage: 'https://media.example/lantern-white.svg'
  }
};

const subscriptionService = {
  addons: [],
  streamingOptionTypes: {
    addon: false,
    buy: false,
    free: false,
    rent: false,
    subscription: true
  }
};

export default {
  fr: {
    countryCode: 'fr',
    name: 'France',
    services: [
      { ...netflix, ...subscriptionService },
      { ...lantern, ...subscriptionService }
    ]
  },
  us: {
    countryCode: 'us',
    name: 'United States',
    services: [ { ...netflix, ...subscriptionService } ]
  }
};
