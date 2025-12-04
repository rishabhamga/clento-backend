type PocketlyFlatArray<Arr, Depth extends number> = {
    done: Arr;
    recur: Arr extends ReadonlyArray<infer InnerArr> ? PocketlyFlatArray<InnerArr, [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20][Depth]> : Arr;
}[Depth extends -1 ? 'done' : 'recur'];

declare global {
    interface Array<T> {
        chunked: (size: number) => T[][];
        groupBy: <K>(keyGetter: (item: T) => K) => Map<K, T[]>;
        mapBy: <K>(keyGetter: (item: T) => K) => Map<K, T>;
        forEachAsyncOneByOne: (fn: (arg0: T, idx?: number) => Promise<any>) => Promise<void>;
        forEachAsyncParallel: (fn: (arg0: T, idx?: number) => Promise<any>) => Promise<void>;
        getRandom: () => T;
        mapAsyncOneByOne: <U>(fn: (arg0: T, idx?: number) => Promise<U>) => Promise<U[]>;
        mapAsyncParallel: <U>(fn: (arg0: T, idx?: number) => Promise<U>) => Promise<U[]>;
        sum: () => number;
        sumBy: (fn: (arg0: T) => number) => number;
        count: (fn?: (arg0: T) => boolean) => number;
        average: () => number;
        averageBy: (fn: (arg0: T) => number) => number;
        flatten: () => Array<PocketlyFlatArray<T, 21>>;
        shuffle: () => T[];
        first: (conditionFunction?: (item: T) => boolean) => T;
        last: () => T;
        firstOrNull: (conditionFunction?: (item: T) => boolean) => T | null;
        lastOrNull: () => T | null;
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

Object.defineProperty(Array.prototype, 'groupBy', {
    value: function (keyGetter: any) {
        const map = new Map();
        this.forEach((item: any) => {
            const key = keyGetter(item);
            const collection = map.get(key);
            if (!collection) {
                map.set(key, [item]);
            } else {
                collection.push(item);
            }
        });
        return map;
    },
});

Object.defineProperty(Array.prototype, 'mapBy', {
    value: function (keyGetter: any) {
        const map = new Map();
        this.forEach((item: any) => {
            const key = keyGetter(item);
            map.set(key, item);
        });
        return map;
    },
});

Object.defineProperty(Array.prototype, 'sum', {
    value: function () {
        const allElementsAreNumber = this.isTypeOfAllElements('number');
        if (!allElementsAreNumber) {
            throw new Error('Function `sum` should only be used on number type');
        }
        return this.reduce((total: number, num: number) => {
            return total + num;
        }, 0);
    },
});

Object.defineProperty(Array.prototype, 'sumBy', {
    value: function (fn: any) {
        return this.reduce((total: number, ele: any) => {
            return total + fn(ele);
        }, 0);
    },
});

Object.defineProperty(Array.prototype, 'count', {
    value: function (fn: any) {
        if (fn) {
            return this.filter(fn).length;
        } else {
            return this.length;
        }
    },
});

Object.defineProperty(Array.prototype, 'average', {
    value: function () {
        const allElementsAreNumber = this.isTypeOfAllElements('number');
        if (!allElementsAreNumber) {
            throw new Error('Function `sum` should only be used on number type');
        }
        return this.sum() / this.length;
    },
});

Object.defineProperty(Array.prototype, 'averageBy', {
    value: function (fn: any) {
        return (
            this.reduce((total: number, ele: any) => {
                return total + fn(ele);
            }, 0) / this.length
        );
    },
});

Object.defineProperty(Array.prototype, 'flatten', {
    value: function () {
        return this.flat(Infinity);
    },
});

Object.defineProperty(Array.prototype, 'shuffle', {
    value: function () {
        let currentIndex = this.length;
        let temporaryValue;
        let randomIndex;
        // While there remain elements to shuffle...
        while (0 !== currentIndex) {
            // Pick a remaining element...
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;

            // And swap it with the current element.
            temporaryValue = this[currentIndex];
            this[currentIndex] = this[randomIndex];
            this[randomIndex] = temporaryValue;
        }
        return this;
    },
});

Object.defineProperty(Array.prototype, 'first', {
    value: function (conditionFunction?: <T>(item: T) => boolean) {
        if (this.length < 1) {
            throw new Error('Index Out of bounds');
        }
        if (conditionFunction) {
            for (let i = 0; i < this.length; i++) {
                const item = this[i];
                const conditionResult = conditionFunction(item);
                if (conditionResult) {
                    return item;
                }
            }
            throw new Error('No Such Element');
        } else {
            return this[0];
        }
    },
});

Object.defineProperty(Array.prototype, 'last', {
    value: function () {
        if (this.length < 1) {
            throw new Error('Index Out of bounds');
        }
        return this[this.length - 1];
    },
});

Object.defineProperty(Array.prototype, 'firstOrNull', {
    value: function (conditionFunction?: <T>(item: T) => boolean) {
        if (this.length < 1) {
            return null;
        }
        if (conditionFunction) {
            for (let i = 0; i < this.length; i++) {
                const item = this[i];
                const conditionResult = conditionFunction(item);
                if (conditionResult) {
                    return item;
                }
            }
            return null;
        } else {
            return this[0];
        }
    },
});

Object.defineProperty(Array.prototype, 'lastOrNull', {
    value: function () {
        if (this.length < 1) {
            return null;
        }
        return this[this.length - 1];
    },
});

export default {};
