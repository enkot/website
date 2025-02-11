import MiniSearch, { type Options as MiniSearchOptions } from 'minisearch'
import type { SearchDisplay, SearchDisplayItem, SearchResult } from 'types/search'

export async function useSearchDefaultResults(): Promise<ComputedRef<SearchDisplay>> {
  const { data: packages } = await useAsyncData('packages', () => queryContent('/packages/').find())

  return computed(() => {
    if (!packages.value)
      return {}

    const defaultOptions: SearchDisplay = {}

    defaultOptions.packages = packages.value.map((item) => {
      if (!item.title || !item._path)
        return null

      return {
        id: item._path,
        title: item.title,
        titles: [],
        level: 0,
        children: null,
      } satisfies SearchDisplayItem
    }).filter(Boolean) as SearchDisplayItem[]

    return defaultOptions
  })
}

export async function useSearchResults(search: MaybeRefOrGetter<string>): Promise<ComputedRef<SearchDisplay>> {
  const website = useWebsite()
  const searchResults = await useSearch(search)

  return computed(() => {
    if (!searchResults.value)
      return {}

    const grouped = searchResults.value.reduce((acc, item) => {
      const group = website.value.search.groups.find(group => item.id.startsWith(group.path))

      // Remove the top level page from the search results like `/packages` or `/blog`
      if (!group || group.path === item.id)
        return acc

      if (!acc[group.name])
        acc[group.name] = []

      const groupItems = acc[group.name]
      const topLevelItem = groupItems.find(groupItem => item.id.startsWith(groupItem.id) && groupItem.level === 0)

      if (topLevelItem && topLevelItem.children) {
        topLevelItem.children.push({
          id: item.id,
          title: item.title,
          titles: item.titles,
          level: item.level,
          children: null,
        })
      }
      else {
        groupItems.push({
          id: item.id,
          title: item.title,
          titles: item.titles,
          level: item.level,
          children: [],
        })
      }

      return acc
    }, {} as SearchDisplay)

    return grouped
  })
}

export async function useSearch(search: MaybeRefOrGetter<string>): Promise<ComputedRef<SearchResult[]>> {
  const { data } = await useFetch<string>('/api/search.txt')

  if (!data.value)
    return computed(() => [])

  const { results } = useIndexedMiniSearch(search, data as Ref<string>, {
    fields: ['title', 'titles', 'text'],
    storeFields: ['title', 'titles', 'text', 'level'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: {
        title: 4,
        text: 2,
        titles: 1,
      },
    },
  })

  return results
}

function useIndexedMiniSearch(search: MaybeRefOrGetter<string>, indexedData: MaybeRefOrGetter<string>, options: MiniSearchOptions) {
  const createIndexedMiniSearch = () => {
    return MiniSearch.loadJSON<SearchResult>(toValue(indexedData), toValue(options))
  }

  const indexedMiniSearch = ref(createIndexedMiniSearch())

  watch(
    () => toValue(options),
    () => { indexedMiniSearch.value = createIndexedMiniSearch() },
    { deep: true },
  )

  watch(
    () => toValue(indexedData),
    () => { indexedMiniSearch.value = createIndexedMiniSearch() },
    { deep: true },
  )

  // function markHints(result: SearchResult) {
  //   const hints: Record<string, string | string[] | null> = {}

  //   result.terms.forEach((term) => {
  //     const regexp = new RegExp(`(${term})`, 'gi')

  //     result.match[term].forEach((field) => {
  //       const value = result[field] as string | string[]

  //       if (typeof value === 'string') {
  //         hints[field] = value.replace(regexp, '<mark>$1</mark>')
  //       }
  //       else if (field === 'titles') {
  //         const markedValue = value.reduce((items, h) => {
  //           if (h.toLowerCase().includes(term))
  //             items.push(h.replace(regexp, '<mark>$1</mark>'))
  //           return items
  //         }, [] as string[])

  //         hints[field] = markedValue.length ? markedValue : null
  //       }
  //     })
  //   })

  //   return hints
  // }

  const results = computed(() => {
    return indexedMiniSearch.value.search(toValue(search)) as SearchResult[]
    // .map((result) => {
    //   result.hints = markHints(result)
    //   return result
    // })
  })

  return {
    results,
    indexedMiniSearch,
  }
}
