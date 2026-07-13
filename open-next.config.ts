import { defineCloudflareConfig } from '@opennextjs/cloudflare/config';

export default defineCloudflareConfig({
  // Keep adapter defaults until a measured caching or image-transform need
  // requires explicit configuration.
});
