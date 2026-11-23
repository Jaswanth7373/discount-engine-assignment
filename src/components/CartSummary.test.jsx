import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CartSummary from './CartSummary.jsx'
import { calculateCart } from '../engine/discountEngine.js'

const cartRule = { ruleId: 'RULE-04', scope: 'cart', appliesTo: null, type: 'percentage', value: 10, stackable: false, minCartValue: 4000 }
const item = (basePrice) => ({ itemId: 'ITEM-01', product: 'Vase', brand: 'B', platform: 'Noon', basePrice })
const render = (price) => renderToStaticMarkup(<CartSummary calculation={calculateCart([item(price)], [cartRule])} />)

describe('CartSummary', () => {
  it('shows the cart offer row and final total when the threshold is met', () => {
    const html = render(5932)
    expect(html).toContain('Cart offer: 10% off')
    expect(html).toContain('Rs.593 saved')
    expect(html).toContain('Rs.5,339')
  })

  it('hides the cart offer row below the threshold and shows the unlock nudge', () => {
    const html = render(3999)
    expect(html).not.toContain('Cart offer:')
    expect(html).toContain('Add Rs.1 more to unlock 10% off your cart')
  })
})
