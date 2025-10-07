declare global {
    interface Array<T> {
        chunked: (size: number) => T[][];
        forEachAsyncOneByOne: (fn: (arg0: T, idx?: number) => Promise<any>) => Promise<void>;
        forEachAsyncParallel: (fn: (arg0: T, idx?: number) => Promise<any>) => Promise<void>;
    }
}
Object.defineProperty(Array.prototype, 'chunked', {
    value: function (size: any) {
        const result = [];
        for (let i = 0; i < this.length; i += size) {
            const chunk = this.slice(i, i + size);
            result.push(chunk);
        }
        return result;
    }
});
Object.defineProperty(Array.prototype, 'forEachAsyncOneByOne', {
    value: async function (fn: any) {
        let i = 0;
        for (const t of this) { await fn(t, i++); }
    }
});

Object.defineProperty(Array.prototype, 'forEachAsyncParallel', {
    value: async function (fn: any) {
        await Promise.all(this.map(fn));
    }
});

export default {};