import { z } from 'zod';
export const Role = z.enum(['owner', 'shop_seller', 'factory_sender']);
