/**
 * Mixin 工具函数
 * 根据 TypeScript 官方文档实现的 mixin 模式
 * @see https://www.typescriptlang.org/docs/handbook/mixins.html
 */

/**
 * 构造函数类型
 * 表示一个可以被 new 调用的类型
 */
export type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * 应用 mixins 到目标类
 * 将多个 mixin 类的属性和方法复制到目标类的原型上
 *
 * @param derivedCtor 目标类的构造函数
 * @param constructors 要混入的类的构造函数数组
 */
export function applyMixins(derivedCtor: any, constructors: any[]): void {
  constructors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      // 跳过 constructor
      if (name === 'constructor') {
        return;
      }

      const propertyDescriptor = Object.getOwnPropertyDescriptor(
        baseCtor.prototype,
        name
      );

      if (propertyDescriptor) {
        Object.defineProperty(
          derivedCtor.prototype,
          name,
          propertyDescriptor
        );
      }
    });
  });
}
