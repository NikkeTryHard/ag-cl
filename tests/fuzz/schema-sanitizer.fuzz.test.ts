/**
 * Fuzz Tests for Schema Sanitizer
 *
 * Property-based testing using fast-check to ensure sanitizeSchema
 * and cleanSchemaForGemini handle arbitrary input without throwing
 * and always produce valid output.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { sanitizeSchema, cleanSchemaForGemini } from "../../src/format/schema-sanitizer.js";
import type { JSONSchema } from "../../src/format/types.js";

// ============================================================================
// Custom Arbitraries for JSON Schema-like Objects
// ============================================================================

/**
 * Generate a random JSON Schema type
 */
const schemaTypeArb = fc.oneof(fc.constant("string"), fc.constant("number"), fc.constant("integer"), fc.constant("boolean"), fc.constant("object"), fc.constant("array"), fc.constant("null"), fc.array(fc.constantFrom("string", "number", "integer", "boolean", "object", "array", "null"), { minLength: 1, maxLength: 4 }));

/**
 * Generate a simple JSON Schema (non-recursive for base case)
 */
const simpleSchemaArb: fc.Arbitrary<JSONSchema> = fc.record(
  {
    type: fc.option(schemaTypeArb, { nil: undefined }),
    description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    title: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
    enum: fc.option(fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean()), { minLength: 1, maxLength: 10 }), { nil: undefined }),
    const: fc.option(fc.oneof(fc.string(), fc.integer(), fc.boolean()), { nil: undefined }),
    default: fc.option(fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)), { nil: undefined }),
    minLength: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
    maxLength: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: undefined }),
    minimum: fc.option(fc.integer({ min: -1000000, max: 1000000 }), { nil: undefined }),
    maximum: fc.option(fc.integer({ min: -1000000, max: 1000000 }), { nil: undefined }),
    pattern: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
    format: fc.option(fc.constantFrom("date-time", "email", "uri", "uuid", "hostname", "ipv4"), { nil: undefined }),
  },
  { requiredKeys: [] },
);

/**
 * Generate a JSON Schema with properties (one level deep)
 */
const schemaWithPropertiesArb: fc.Arbitrary<JSONSchema> = fc.record(
  {
    type: fc.constant("object"),
    description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    properties: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
      simpleSchemaArb,
      { minKeys: 0, maxKeys: 10 },
    ),
    required: fc.option(
      fc.array(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
        { minLength: 0, maxLength: 5 },
      ),
      { nil: undefined },
    ),
    additionalProperties: fc.option(fc.boolean(), { nil: undefined }),
  },
  { requiredKeys: [] },
);

/**
 * Generate a JSON Schema with array items
 */
const schemaWithItemsArb: fc.Arbitrary<JSONSchema> = fc.record(
  {
    type: fc.constant("array"),
    description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    items: simpleSchemaArb,
    minItems: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
    maxItems: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
  },
  { requiredKeys: [] },
);

/**
 * Generate a schema with $ref
 */
const schemaWithRefArb: fc.Arbitrary<JSONSchema> = fc.record(
  {
    $ref: fc.oneof(
      fc.constant("#/$defs/SomeType"),
      fc.constant("#/definitions/AnotherType"),
      fc.string({ minLength: 1, maxLength: 50 }).map((s) => `#/$defs/${s}`),
    ),
    description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  },
  { requiredKeys: ["$ref"] },
);

/**
 * Generate a schema with allOf
 */
const schemaWithAllOfArb: fc.Arbitrary<JSONSchema> = fc.record(
  {
    allOf: fc.array(simpleSchemaArb, { minLength: 1, maxLength: 4 }),
    description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  },
  { requiredKeys: ["allOf"] },
);

/**
 * Generate a schema with anyOf/oneOf
 */
const schemaWithUnionArb: fc.Arbitrary<JSONSchema> = fc.record(
  {
    anyOf: fc.option(fc.array(simpleSchemaArb, { minLength: 1, maxLength: 4 }), { nil: undefined }),
    oneOf: fc.option(fc.array(simpleSchemaArb, { minLength: 1, maxLength: 4 }), { nil: undefined }),
    description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  },
  { requiredKeys: [] },
);

/**
 * Combined schema arbitrary for fuzzing
 */
const anySchemaArb: fc.Arbitrary<JSONSchema> = fc.oneof(simpleSchemaArb, schemaWithPropertiesArb, schemaWithItemsArb, schemaWithRefArb, schemaWithAllOfArb, schemaWithUnionArb);

/**
 * Generate deeply nested schemas using fc.letrec (fast-check v4 way)
 */
const deeplyNestedSchemaArb: fc.Arbitrary<JSONSchema> = fc.letrec((tie) => ({
  schema: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    simpleSchemaArb,
    fc.record(
      {
        type: fc.constant("object"),
        properties: fc.dictionary(
          fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-zA-Z_]\w*$/.test(s)),
          tie("schema"),
          { minKeys: 1, maxKeys: 3 },
        ),
      },
      { requiredKeys: ["type"] },
    ),
    fc.record(
      {
        type: fc.constant("array"),
        items: tie("schema"),
      },
      { requiredKeys: ["type"] },
    ),
  ),
})).schema;

// ============================================================================
// Property-Based Tests for sanitizeSchema
// ============================================================================

describe("sanitizeSchema Fuzz Tests", () => {
  describe("never throws", () => {
    it("handles random simple schemas", () => {
      fc.assert(
        fc.property(simpleSchemaArb, (schema) => {
          expect(() => sanitizeSchema(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 500 },
      );
    });

    it("handles random schemas with properties", () => {
      fc.assert(
        fc.property(schemaWithPropertiesArb, (schema) => {
          expect(() => sanitizeSchema(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 500 },
      );
    });

    it("handles random schemas with items", () => {
      fc.assert(
        fc.property(schemaWithItemsArb, (schema) => {
          expect(() => sanitizeSchema(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 500 },
      );
    });

    it("handles any schema variant", () => {
      fc.assert(
        fc.property(anySchemaArb, (schema) => {
          expect(() => sanitizeSchema(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 1000 },
      );
    });

    it("handles null and undefined", () => {
      expect(() => sanitizeSchema(null as unknown as JSONSchema)).not.toThrow();
      expect(() => sanitizeSchema(undefined as unknown as JSONSchema)).not.toThrow();
    });

    it("handles non-object inputs", () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)), (input) => {
          expect(() => sanitizeSchema(input as unknown as JSONSchema)).not.toThrow();
          return true;
        }),
        { numRuns: 200 },
      );
    });

    it("handles deeply nested schemas", () => {
      fc.assert(
        fc.property(deeplyNestedSchemaArb, (schema) => {
          expect(() => sanitizeSchema(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 200 },
      );
    });
  });

  describe("output is always valid", () => {
    it("output always has type property", () => {
      fc.assert(
        fc.property(anySchemaArb, (schema) => {
          const result = sanitizeSchema(schema);
          return "type" in result && result.type !== undefined;
        }),
        { numRuns: 500 },
      );
    });

    it("object type always has properties", () => {
      fc.assert(
        fc.property(anySchemaArb, (schema) => {
          const result = sanitizeSchema(schema);
          if (result.type === "object") {
            return "properties" in result && result.properties !== undefined && typeof result.properties === "object";
          }
          return true;
        }),
        { numRuns: 500 },
      );
    });

    it("output is always an object", () => {
      fc.assert(
        fc.property(anySchemaArb, (schema) => {
          const result = sanitizeSchema(schema);
          return typeof result === "object" && result !== null && !Array.isArray(result);
        }),
        { numRuns: 500 },
      );
    });

    it("converts const to enum", () => {
      fc.assert(
        fc.property(
          fc.record({
            const: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
            type: fc.option(fc.constant("string"), { nil: undefined }),
          }),
          (schema) => {
            const result = sanitizeSchema(schema as JSONSchema);
            // const should be converted to enum
            return !("const" in result) || "enum" in result;
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe("handles edge cases", () => {
    it("handles empty object", () => {
      const result = sanitizeSchema({});
      expect(result).toBeDefined();
      expect(result.type).toBe("object");
      expect(result.properties).toBeDefined();
    });

    it("handles schema with only unsupported fields", () => {
      const schema: JSONSchema = {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: "test",
        $comment: "A test schema",
        definitions: { Foo: { type: "string" } },
      };

      const result = sanitizeSchema(schema);
      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
    });

    it("handles circular-like structures (same reference pattern)", () => {
      const innerSchema: JSONSchema = { type: "string" };
      const schema: JSONSchema = {
        type: "object",
        properties: {
          a: innerSchema,
          b: innerSchema,
          c: innerSchema,
        },
      };

      const result = sanitizeSchema(schema);
      expect(result).toBeDefined();
      expect(result.properties?.a).toBeDefined();
      expect(result.properties?.b).toBeDefined();
      expect(result.properties?.c).toBeDefined();
    });
  });
});

// ============================================================================
// Property-Based Tests for cleanSchemaForGemini
// ============================================================================

describe("cleanSchemaForGemini Fuzz Tests", () => {
  describe("never throws", () => {
    it("handles random simple schemas", () => {
      fc.assert(
        fc.property(simpleSchemaArb, (schema) => {
          expect(() => cleanSchemaForGemini(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 500 },
      );
    });

    it("handles random schemas with properties", () => {
      fc.assert(
        fc.property(schemaWithPropertiesArb, (schema) => {
          expect(() => cleanSchemaForGemini(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 500 },
      );
    });

    it("handles schemas with $ref", () => {
      fc.assert(
        fc.property(schemaWithRefArb, (schema) => {
          expect(() => cleanSchemaForGemini(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 300 },
      );
    });

    it("handles schemas with allOf", () => {
      fc.assert(
        fc.property(schemaWithAllOfArb, (schema) => {
          expect(() => cleanSchemaForGemini(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 300 },
      );
    });

    it("handles schemas with anyOf/oneOf", () => {
      fc.assert(
        fc.property(schemaWithUnionArb, (schema) => {
          expect(() => cleanSchemaForGemini(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 300 },
      );
    });

    it("handles any schema variant", () => {
      fc.assert(
        fc.property(anySchemaArb, (schema) => {
          expect(() => cleanSchemaForGemini(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 1000 },
      );
    });

    it("handles null and undefined", () => {
      expect(() => cleanSchemaForGemini(null as unknown as JSONSchema)).not.toThrow();
      expect(() => cleanSchemaForGemini(undefined as unknown as JSONSchema)).not.toThrow();
    });

    it("handles deeply nested schemas", () => {
      fc.assert(
        fc.property(deeplyNestedSchemaArb, (schema) => {
          expect(() => cleanSchemaForGemini(schema)).not.toThrow();
          return true;
        }),
        { numRuns: 200 },
      );
    });
  });

  describe("removes unsupported keywords", () => {
    it("removes $ref from output", () => {
      fc.assert(
        fc.property(schemaWithRefArb, (schema) => {
          const result = cleanSchemaForGemini(schema);
          return !("$ref" in result);
        }),
        { numRuns: 200 },
      );
    });

    it("removes allOf from output", () => {
      fc.assert(
        fc.property(schemaWithAllOfArb, (schema) => {
          const result = cleanSchemaForGemini(schema);
          return !("allOf" in result);
        }),
        { numRuns: 200 },
      );
    });

    it("removes anyOf/oneOf from output", () => {
      fc.assert(
        fc.property(schemaWithUnionArb, (schema) => {
          const result = cleanSchemaForGemini(schema);
          return !("anyOf" in result) && !("oneOf" in result);
        }),
        { numRuns: 200 },
      );
    });

    it("removes additionalProperties from output", () => {
      fc.assert(
        fc.property(schemaWithPropertiesArb, (schema) => {
          const result = cleanSchemaForGemini(schema);
          return !("additionalProperties" in result);
        }),
        { numRuns: 200 },
      );
    });

    it("removes $defs and definitions from output", () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constant("object"),
            $defs: fc.option(fc.dictionary(fc.string(), simpleSchemaArb), { nil: undefined }),
            definitions: fc.option(fc.dictionary(fc.string(), simpleSchemaArb), { nil: undefined }),
          }),
          (schema) => {
            const result = cleanSchemaForGemini(schema as JSONSchema);
            return !("$defs" in result) && !("definitions" in result);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe("flattens type arrays", () => {
    it("converts type arrays to single type", () => {
      const schemaWithTypeArray: fc.Arbitrary<JSONSchema> = fc.record({
        type: fc.array(fc.constantFrom("string", "number", "null", "boolean"), { minLength: 2, maxLength: 4 }),
        description: fc.option(fc.string(), { nil: undefined }),
      });

      fc.assert(
        fc.property(schemaWithTypeArray, (schema) => {
          const result = cleanSchemaForGemini(schema);
          // Result type should be a string, not an array
          return typeof result.type === "string" || result.type === undefined;
        }),
        { numRuns: 200 },
      );
    });
  });

  describe("validates required array", () => {
    it("required only contains existing properties", () => {
      fc.assert(
        fc.property(schemaWithPropertiesArb, (schema) => {
          // Add some required fields that may or may not exist
          const schemaWithRequired = {
            ...schema,
            required: ["existingProp", "nonExistingProp", "anotherMissing"],
          };

          const result = cleanSchemaForGemini(schemaWithRequired);

          if (result.required && result.properties) {
            const propKeys = new Set(Object.keys(result.properties));
            return result.required.every((r) => propKeys.has(r));
          }
          return true;
        }),
        { numRuns: 300 },
      );
    });
  });

  describe("output structure is valid", () => {
    it("output is always an object when input is object", () => {
      fc.assert(
        fc.property(anySchemaArb, (schema) => {
          const result = cleanSchemaForGemini(schema);
          return typeof result === "object" && result !== null && !Array.isArray(result);
        }),
        { numRuns: 500 },
      );
    });

    it("preserves description field", () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constant("string"),
            description: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          (schema) => {
            const result = cleanSchemaForGemini(schema as JSONSchema);
            // Description should be preserved or enhanced (with hints)
            return typeof result.description === "string";
          },
        ),
        { numRuns: 200 },
      );
    });

    it("preserves enum field", () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constant("string"),
            enum: fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          }),
          (schema) => {
            const result = cleanSchemaForGemini(schema as JSONSchema);
            // Enum should be preserved
            return Array.isArray(result.enum);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe("stress tests", () => {
    it("handles very deeply nested schemas", () => {
      fc.assert(
        fc.property(deeplyNestedSchemaArb, (schema) => {
          const result = cleanSchemaForGemini(schema);
          return typeof result === "object" && result !== null;
        }),
        { numRuns: 50 },
      );
    });

    it("handles schemas with many properties", () => {
      const manyPropsArb = fc.record({
        type: fc.constant("object"),
        properties: fc.dictionary(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-zA-Z_]\w*$/.test(s)),
          simpleSchemaArb,
          { minKeys: 20, maxKeys: 50 },
        ),
      });

      fc.assert(
        fc.property(manyPropsArb, (schema) => {
          const result = cleanSchemaForGemini(schema as JSONSchema);
          return typeof result === "object" && result.properties !== undefined;
        }),
        { numRuns: 50 },
      );
    });

    it("handles random JSON objects as schema", () => {
      fc.assert(
        fc.property(fc.object({ maxDepth: 5 }), (obj) => {
          expect(() => cleanSchemaForGemini(obj as JSONSchema)).not.toThrow();
          return true;
        }),
        { numRuns: 300 },
      );
    });
  });
});
