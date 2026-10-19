import catalogProducts from '../data/nova-catalog.json' with { type: 'json' };
import { createVercelOrderHandler } from '../lib/order-notification.mjs';

export default createVercelOrderHandler({ catalogProducts });
