import {sourceStatus} from '../src/server/sourceStatus.js';
export default function handler(req,res){res.setHeader('Cache-Control','no-store');return res.status(200).json(sourceStatus());}
