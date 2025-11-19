declare global {
    interface Map<K, V> {
        getValuesArray: () => V[];
        getKeysArray: () => K[];
        mapValues: <T>(valueGetter: (value: V, key?: K) => T) => Map<K, T>;
        toJSON: <K>() => { [key: string]: any };
        forEachAsyncOneByOne: (fn: (value: V, key?: K) => Promise<any>) => Promise<void>;
        getOrDefault: (key: K, defaultValue: V | null) => V | null;
        getOrThrow: (key: K) => V | null;
        getKeyValueAsPair: () => Array<[K, V]>;
    }
}

Map.prototype.getValuesArray = function () {
    return Array.from(this.values());
};

Map.prototype.getKeysArray = function () {
    return Array.from(this.keys());
};

Map.prototype.mapValues = function (valueGetter) {
    const newMap = new Map();
    Array.from(this.keys()).forEach(key => {
        const value = this.get(key);
        const newValue = valueGetter(value, key);
        newMap.set(key, newValue);
    });
    return newMap;
};

Map.prototype.toJSON = function () {
    const returningObject: { [key: string]: any } = {};
    Array.from(this.keys()).forEach((key: string) => {
        returningObject[key] = this.get(key);
    });
    return returningObject;
};

Map.prototype.forEachAsyncOneByOne = async function (fn) {
    for (const key of this.keys()) {
        await fn(this.get(key), key);
    }
};

Map.prototype.getOrDefault = function (key, defaultValue) {
    if (this.has(key)) {
        return this.get(key);
    } else {
        return defaultValue;
    }
};

Map.prototype.getOrThrow = function (key) {
    if (this.has(key)) {
        return this.get(key);
    } else {
        throw new Error(`Cant find the key ${key} in the map`);
    }
};

Map.prototype.getKeyValueAsPair = function () {
    return Array.from(this.keys()).map(key => [key, this.get(key)]);
};

export default {}; // just because apparently it looks necessary
