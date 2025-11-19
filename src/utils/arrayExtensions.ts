declare global {
    interface Array<T> {
        chunked: (size: number) => T[][];
        forEachAsyncOneByOne: (fn: (arg0: T, idx?: number) => Promise<any>) => Promise<void>;
        forEachAsyncParallel: (fn: (arg0: T, idx?: number) => Promise<any>) => Promise<void>;
        getRandom: () => T;
        mapAsyncOneByOne: <U>(fn: (arg0: T, idx?: number) => Promise<U>) => Promise<U[]>;
        mapAsyncParallel: <U>(fn: (arg0: T, idx?: number) => Promise<U>) => Promise<U[]>;
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
    },
});
Object.defineProperty(Array.prototype, 'forEachAsyncOneByOne', {
    value: async function (fn: any) {
        let i = 0;
        for (const t of this) {
            await fn(t, i++);
        }
    },
});

Object.defineProperty(Array.prototype, 'forEachAsyncParallel', {
    value: async function (fn: any) {
        await Promise.all(this.map(fn));
    },
});

Object.defineProperty(Array.prototype, 'getRandom', {
    value: function () {
        return this[Math.floor(Math.random() * this.length)];
    },
});

Object.defineProperty(Array.prototype, 'mapAsyncOneByOne', {
    value: async function (fn: any) {
        const resultSet = [];
        let i = 0;
        for (const t of this) {
            resultSet.push(await fn(t, i++));
        }
        return resultSet;
    },
});

Object.defineProperty(Array.prototype, 'mapAsyncParallel', {
    value: async function (fn: any) {
        return await Promise.all(this.map(fn));
    },
});

export default {};
