import type { MetadataRoute } from 'next';
import { buildDiscoveryRobots } from '@/lib/metadata/discovery';

export default function robots(): MetadataRoute.Robots {
  return buildDiscoveryRobots();
}
