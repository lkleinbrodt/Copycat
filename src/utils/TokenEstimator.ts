export class TokenEstimator {
    estimateTokens(content: string): number {
        return Math.ceil(content.length / 4);
    }
}
