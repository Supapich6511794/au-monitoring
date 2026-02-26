'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface PortalProps {
  children: React.ReactNode
  containerId?: string
}

export function Portal({ children, containerId = 'modal-root' }: PortalProps) {
  const [mounted, setMounted] = useState(false)
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setMounted(true)
    
    let element = document.getElementById(containerId)
    
    if (!element) {
      element = document.createElement('div')
      element.id = containerId
      document.body.appendChild(element)
    }
    
    setContainer(element)

    return () => {
      if (element && element.parentNode && element.childNodes.length === 0) {
        element.parentNode.removeChild(element)
      }
    }
  }, [containerId])

  if (!mounted || !container) {
    return null
  }

  return createPortal(children, container)
}
