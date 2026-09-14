import { NextFunction, Request, Response } from "express";

import geoip from 'geoip-lite';

declare global {
    namespace Express {
        interface Request {
            region?: {
                ip?: string;
                country?: string;
                region?: string;
                city?: string;
                timezone?: string;
            };
        }
    }
}

export const verifyRegion = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const rawIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    const clientIp = (Array.isArray(rawIp) ? rawIp[0] : rawIp).split(',')[0].trim();

    const geo = clientIp ? geoip.lookup(clientIp) : null;

    if (geo) {
        req.region = {
            ip: clientIp,
            country: geo.country,
            region: geo.region,
            city: geo.city,
            timezone: geo.timezone
        };
    } else {
        req.region = {
            ip: clientIp || "Unknown",
            country: "Unknown",
            region: "Unknown",
            city: "Unknown",
            timezone: "Unknown"
        };
    }

    next();
}