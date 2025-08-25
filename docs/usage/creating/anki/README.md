# Creating Anki Data

This guide covers the different approaches for creating new Anki packages from scratch using srs-converter.

## Three Approaches to Generate Anki Packages

There are currently **two available approaches** and one planned approach for generating Anki packages:

| Approach                                                                                                                | Status       | Complexity | Flexibility | When to Use                                    |
| ----------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- | ----------- | ---------------------------------------------- |
| **[Raw Anki Methods](raw-anki-methods.md)**                                                                             | ✅ Available | High       | Maximum     | Need full Anki features, complex customization |
| **[Universal SRS Creation](../universal/README.md)** followed by **[Anki Conversion](../../converting/srs-to-anki.md)** | ✅ Available | Low        | Limited     | Simple use cases, clean API preferred          |
| **Simplified API**                                                                                                      | ❌ Planned   | Medium     | Medium      | Balance of ease and control                    |

## Quick Comparison

### 1. Raw Anki Methods

Direct manipulation of Anki's internal structures using the exact field names and formats that Anki uses.

**Pros:**

- Maximum flexibility and functionality
- Direct control over output
- Access to all Anki features

**Cons:**

- Requires deep knowledge of Anki internals
- Arcane field names (`flds`, `sfld`, `mid`, `usn`)
- Manual HTML escaping and field concatenation
- Easy to create invalid packages

### 2. Universal SRS Creation

Create data using clean, normalized APIs and convert to Anki format.

**Pros:**

- Clean, TypeScript-friendly APIs
- Automatic validation and error handling
- Future-proof (works with other SRS formats)

**Cons:**

- Limited to implemented SRS features
- May not support all Anki functionality
- Extra conversion step

### 3. Simplified API (Planned)

I plan to make a third option available, with an API similar to Python's genanki library.
This will abstract away the most arcane internals of the Anki format while still trying to stay close to it.
