import { ViewContext, ViewDefinition } from '../context.js';
import { NetworkRequest } from '../model.js';
/** Seed a mock from a real response, then open its body for editing. */
export declare function mockRequest(ctx: ViewContext, request: NetworkRequest): void;
export declare const networkView: ViewDefinition;
