/**
 * @file Menu
 * @description 导航菜单，基于rc-menu实现：https://github.com/react-component/menu
 * @author fex
 */

import React from 'react';
import uniq from 'lodash/uniq';
import isEqual from 'lodash/isEqual';
import isEqualWith from 'lodash/isEqualWith';
import RcMenu, {
  MenuProps as RcMenuProps,
  Divider as RcDivider,
  ItemGroup
} from 'rc-menu';
import Overflow from 'rc-overflow';
import Sortable from 'sortablejs';
import {
  mapTree,
  autobind,
  filterTree,
  findTree,
  getTreeAncestors
} from 'amis-core';
import {ClassNamesFn, themeable} from 'amis-core';

import {Icon} from '../icons';
import {BadgeObject} from '../Badge';
import MenuItem, {MenuItemProps} from './MenuItem';
import SubMenu, {SubMenuProps} from './SubMenu';
import {MenuContext} from './MenuContext';

export interface NavigationItem {
  id?: string;
  label?: string | React.ReactNode;
  icon?: string | React.ReactNode;
  expandIcon?: string | React.ReactNode;
  path?: string;
  paths?: NavigationItem[];
  disabled?: boolean;
  disabledTip?: string;
  children?: Array<NavigationItem>;
  className?: string;
  badgeClassName?: string;
  tooltipClassName?: string;
  component?: React.ReactNode;
  hidden?: boolean;
  isDivider?: boolean;
  permission?: string;
  persistState?: boolean;
  keepInHistory?: boolean;
  mode?: string; // 菜单项是否为分组标题 mode: group
  [propName: string]: any;
}

// RcMenu中支持vertical-right 但RcMenuProps没有同步更新
export interface MenuProps extends Omit<RcMenuProps, 'mode'> {
  className?: string;
  classPrefix: string;
  classnames: ClassNamesFn;

  /**
   * 导航项数据，支持树状结构
   */
  navigations: Array<NavigationItem>;

  /**
   * 导航排列方式 stacked为true垂直 默认为false
   */
  stacked?: true | false;

  /**
   * 垂直模式 非折叠状态下 控制菜单打开方式
   */
  mode?: 'inline' | 'float'; // float（悬浮）inline（内联） 默认inline

  /**
   * 主题配色
   */
  themeColor: 'light' | 'dark';

  /**
   * 菜单是否折叠收起，仅在mode为vertical时生效
   */
  collapsed?: boolean;

  /**
   * 子菜单触发方式
   */
  triggerSubMenuAction: 'hover' | 'click';

  /**
   * 布局排列方式，默认rtl(right to left)
   */
  direction: 'rtl' | 'ltr';

  /**
   * 渲染popover子菜单的位置，mode为vertical和horizontal时生效
   */
  popOverContainer: (node: HTMLElement) => HTMLElement;

  /**
   * 水平导航模式下，Menu折叠状态的图标或文案
   */
  overflowedIndicator?: React.ReactNode;

  /**
   * 水平导航模式下，是否禁用响应式收纳
   */
  disabledOverflow?: boolean;

  /**
   * 响应式收纳展示最大个数
   */
  overflowMaxCount?: number;

  /**
   * 自定义响应浮层元素
   */
  overflowComponent?: string;

  /**
   * 响应式收纳展开浮层样式
   */
  overflowedIndicatorPopupClassName?: string;

  /**
   * 导航列表后缀节点
   */
  overflowSuffix?: React.ReactNode;

  /**
   * 响应收纳项宽度
   */
  overflowItemWidth?: number;

  /**
   * 响应收纳最外层元素样式
   */
  overflowStyle?: Object;

  /**
   * 切换展开状态的ICON
   */
  expandIcon?: string | React.ReactNode;

  /**
   * 垂直导航水平缩进值
   */
  inlineIndent?: number;

  /**
   * 禁用状态
   */
  disabled?: boolean;

  location?: any;

  history?: any;

  /**
   * 统一路由前缀
   */
  prefix?: string;

  /**
   * 导航项是否展开
   */
  isOpen: (link: NavigationItem) => boolean;

  /**
   * 导航项是否激活
   */
  isActive: Function;

  /**
   * 导航项渲染方式
   */
  renderLink: Function;

  /**
   * 展开/收起子菜单Event
   */
  onToggleExpand?: (keys: String[]) => void;

  // (link: any, depth: number) => boolean
  onSelect?: any;

  onToggle: (link: any, depth: number, forceFold?: boolean) => void;

  onDragStart?: (
    link: any
  ) => (event: React.DragEvent<HTMLAnchorElement>) => void;

  badge?: BadgeObject;

  data?: any;

  /**
   * 垂直inline模式下 菜单互斥展开
   */
  accordion?: boolean;

  /**
   * 支持排序
   */
  draggable?: boolean;

  /**
   * 展开按钮在最前面
   */
  expandBefore?: boolean;
}

interface MenuState {
  navigations: Array<NavigationItem>;
  activeKey: Array<string> | undefined;
  defaultOpenKeys: string[];
  openKeys: string[];
  [propName: string]: any;
}

export class Menu extends React.Component<MenuProps, MenuState> {
  static defaultProps: Pick<
    MenuProps,
    | 'collapsed'
    | 'themeColor'
    | 'stacked'
    | 'mode'
    | 'direction'
    | 'prefix'
    | 'triggerSubMenuAction'
    | 'popOverContainer'
    | 'renderLink'
    | 'isActive'
    | 'isOpen'
    | 'inlineIndent'
  > = {
    collapsed: false,
    themeColor: 'light',
    stacked: true,
    mode: 'inline',
    direction: 'ltr',
    prefix: '',
    triggerSubMenuAction: 'click',
    inlineIndent: 15,
    popOverContainer: () => document.body,
    renderLink: (link: MenuItemProps) => {
      return {pathname: link.path};
    },
    isActive: (link: NavigationItem, prefix: string = '') => {
      const path = link.path;
      const ret = location.pathname === path;

      return !!ret;
    },
    isOpen: (item: NavigationItem) =>
      item.children ? item.children.some(item => item.open) : false
  };

  sortable?: Sortable;

  constructor(props: MenuProps) {
    super(props);

    const {transformedNav, activeKey, defaultOpenKeys, openKeys} =
      this.normalizeNavigations({
        ...props
      });

    this.state = {
      navigations: transformedNav,
      activeKey,
      defaultOpenKeys,
      openKeys
    };
  }

  componentDidUpdate(prevProps: MenuProps, prevState: MenuState) {
    const props = this.props;
    const isOpen = prevProps.isOpen;
    let isNavDiff = prevProps.navigations.length !== props.navigations.length;
    if (!isNavDiff) {
      // 顺序也要保持一致
      for (let [index, item] of props.navigations.entries()) {
        if (!isEqual(item, prevProps.navigations[index])) {
          isNavDiff = true;
          break;
        }
      }
    }
    if (isNavDiff || !isEqual(prevProps.location, props.location)) {
      const {transformedNav, activeKey, defaultOpenKeys, openKeys} =
        this.normalizeNavigations({
          ...props,
          isOpen
        });

      this.setState({
        navigations: transformedNav,
        activeKey,
        defaultOpenKeys,
        openKeys
      });
    }
  }

  getKeyPaths(navigations: Array<NavigationItem>, key: string) {
    const activeItem = findTree(navigations, item => item.id === key);
    if (!activeItem) {
      return [];
    }
    const ancestors = getTreeAncestors(navigations, activeItem);
    return ancestors ? ancestors.map(item => item.id || '') : [];
  }

  normalizeNavigations(props: MenuProps) {
    const {navigations, prefix, isActive, isOpen, stacked} = props;
    let id = 1;
    const activeKeys: Array<string> = [];
    const openKeys: Array<string> = [];

    const transformedNav = mapTree(
      filterTree(
        navigations,
        (item: NavigationItem, key: any, level: number): any => {
          // 水平导航不需要分割线
          if (!stacked && item?.isDivider) {
            return false;
          }
          return true;
        }
      ),
      (
        item: NavigationItem,
        key: any,
        level: number,
        paths: Array<Omit<NavigationItem, 'children'>>
      ) => {
        // 如果没有传入key，则为导航加一个自增key
        const navId = (item.id || item.key || id++).toString();

        if (!activeKeys.find(key => key === navId) && isActive(item, prefix)) {
          activeKeys?.push(navId);
        }

        const open = isOpen(item as NavigationItem);
        if (!openKeys.find(key => key === navId) && open) {
          openKeys.push(navId);
        }

        return {
          ...item,
          id: navId,
          active: isActive,
          depth: level,
          children: item.children
        };
      },
      1,
      false
    );

    let activeKeyPaths: Array<string> = [];
    activeKeys.forEach(key => {
      activeKeyPaths = [
        ...activeKeyPaths,
        ...this.getKeyPaths(transformedNav, key),
        key
      ];
    });

    return {
      transformedNav,
      activeKey: activeKeys,
      defaultOpenKeys: activeKeyPaths,
      openKeys
    };
  }

  @autobind
  async handleItemClick({
    key,
    domEvent,
    keyPath
  }: {
    key: string;
    domEvent: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>;
    keyPath: string[];
  }) {
    // 菜单项里面可能会有按钮
    // 如果里面事件执行了e.preventDefault() 则不执行后面的
    if (domEvent && domEvent.defaultPrevented) {
      return;
    }
    const {onSelect} = this.props;
    const currentItem = findTree(
      this.state.navigations,
      item => item.id === key
    );
    const result =
      onSelect &&
      (await onSelect(currentItem?.link || currentItem, keyPath.length));

    if (result === false) {
      return;
    }
    this.setState({activeKey: [key]});
  }

  @autobind
  handleSubMenuTitleClick({
    key,
    domEvent,
    props
  }: {
    key: string;
    domEvent: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>;
    props: SubMenuProps;
  }) {
    if (domEvent && domEvent.defaultPrevented) {
      return;
    }

    this.selectSubItem({key, domEvent, props});
  }

  selectSubItem({
    key,
    domEvent,
    props
  }: {
    key: string;
    domEvent: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>;
    props: SubMenuProps;
  }) {
    const {navigations} = this.state;
    const {
      stacked,
      mode,
      collapsed,
      accordion,
      onToggleExpand,
      onToggle,
      onSelect
    } = this.props;
    const isVericalInline = stacked && mode === 'inline' && !collapsed;

    let openKeys = this.state.openKeys.concat();
    const isOpen = openKeys.includes(key);
    const keyPaths = this.getKeyPaths(navigations, key);
    if (isOpen) {
      openKeys = openKeys.filter(item => item !== key);
    } else {
      if (isVericalInline && accordion) {
        openKeys = [...keyPaths, key];
      } else {
        openKeys = [...openKeys, key];
      }
    }

    const currentItem = findTree(navigations, item => item.id === key);
    // 因为Nav里只处理当前菜单项 因此新增一个onToggle事件
    onToggle?.(currentItem?.link, keyPaths.length, isOpen);
    onToggleExpand?.(uniq(openKeys));

    onSelect?.(currentItem?.link || currentItem, keyPaths.length);
  }

  @autobind
  handleToggleExpand(ctx: {
    isSelected?: boolean;
    isOpen?: boolean;
    isSubMenu?: boolean;
    disabled?: boolean;
    [propName: string]: any;
  }) {
    const navigations = this.state.navigations;
    const {onToggleExpand, stacked, mode, collapsed, accordion, onToggle} =
      this.props;
    const {disabled, eventKey, isOpen, isSubMenu} = ctx;
    let openKeys = this.state.openKeys.concat();
    const isVericalInline = stacked && mode === 'inline' && !collapsed;
    const keyPaths = this.getKeyPaths(navigations, eventKey);

    if (isSubMenu && !disabled) {
      // isOpen是当前菜单的展开状态
      if (isOpen) {
        openKeys = openKeys.filter(key => key !== eventKey);
      } else {
        // 手风琴模式 仅展开
        if (isVericalInline && accordion) {
          openKeys = [...keyPaths, eventKey];
        } else {
          openKeys.push(eventKey);
        }
      }
      const currentItem = findTree(navigations, item => item.id === eventKey);
      // 因为Nav里只处理当前菜单项 因此新增一个onToggle事件
      onToggle?.(currentItem?.link, keyPaths.length, isOpen);
      onToggleExpand?.(uniq(openKeys));
    }
  }

  @autobind
  renderExpandIcon(ctx: {
    isSelected?: boolean;
    isOpen?: boolean;
    isSubMenu?: boolean;
    disabled?: boolean;
    [propName: string]: any;
  }) {
    const {classnames: cx, expandIcon} = this.props;
    return (
      <span
        key="expand-toggle"
        className={cx('Nav-Menu-submenu-arrow')}
        onClick={(e: React.MouseEvent<HTMLElement>) => {
          this.handleToggleExpand(ctx);
          e.preventDefault();
        }}
      >
        {!expandIcon || !React.isValidElement(expandIcon) ? (
          <Icon icon="right-arrow-bold" className="icon" />
        ) : typeof expandIcon === 'string' ? (
          <i className={cx(expandIcon)} />
        ) : (
          expandIcon
        )}
      </span>
    );
  }

  renderMenuContent(list: NavigationItem[], level?: number) {
    const {
      renderLink,
      classnames: cx,
      themeColor,
      disabled,
      badge,
      data,
      isActive,
      collapsed
    } = this.props;

    return list.map((item: NavigationItem, index: number) => {
      // 如果这一级是分组标题 那么level不递增
      // 如果这一层第一个就是分组标题 那么收起状态下 不展示分割线
      if (item.mode && item.mode === 'group') {
        return (
          <ItemGroup
            key={item.id}
            title={collapsed ? '' : item.label}
            className={item.className}
          >
            {collapsed && index > 0 ? (
              <RcDivider key={'group-divider' + item.id} />
            ) : null}
            {this.renderMenuContent(item.children || [], item.depth)}
          </ItemGroup>
        );
      }
      const itemDisabled =
        item.disabled === undefined ? disabled : item.disabled;
      const link = item.link;

      if (
        (link && link.defer && !link.loaded) ||
        (item.children && item.children.length)
      ) {
        return (
          <SubMenu
            {...item}
            key={item.id}
            disabled={itemDisabled || link.loading}
            active={isActive(item)}
            badge={badge}
            renderLink={renderLink}
            depth={level || 1}
          >
            {this.renderMenuContent(item.children || [], item.depth + 1)}
          </SubMenu>
        );
      }
      return item.isDivider ? (
        <RcDivider
          key={item.id}
          className={cx(`Nav-Menu-item-divider`, {
            ['Nav-Menu-item-divider-dark']: themeColor === 'dark'
          })}
        />
      ) : (
        <MenuItem
          {...item}
          key={item.id}
          disabled={itemDisabled}
          renderLink={renderLink}
          badge={badge}
          data={data}
          depth={level || 1}
        />
      );
    });
  }

  render() {
    const {
      classPrefix,
      className,
      classnames: cx,
      collapsed,
      themeColor,
      stacked,
      mode,
      accordion,
      prefix,
      disabled,
      draggable,
      triggerSubMenuAction,
      direction,
      overflowedIndicator,
      disabledOverflow,
      overflowMaxCount,
      overflowComponent,
      overflowedIndicatorPopupClassName,
      overflowSuffix,
      overflowItemWidth,
      overflowStyle,
      popOverContainer,
      inlineIndent,
      expandBefore,
      onDragStart
    } = this.props;
    const {navigations, activeKey, defaultOpenKeys, openKeys} = this.state;
    const isDarkTheme = themeColor === 'dark';
    const disabledItem = findTree(navigations, item => !!item.disabled);
    const rcMode = stacked
      ? mode === 'float'
        ? 'vertical-right'
        : 'vertical'
      : 'horizontal';

    return (
      <MenuContext.Provider
        value={{
          themeColor,
          stacked,
          mode,
          collapsed,
          direction,
          prefix,
          inlineIndent,
          accordion,
          draggable,
          onDragStart,
          onSubmenuClick: this.handleSubMenuTitleClick
        }}
      >
        <RcMenu
          key="menu"
          prefixCls={`${classPrefix}Nav-Menu`}
          className={cx(`Nav-Menu-${direction}`, className, {
            ['Nav-Menu-collapsed']: stacked && collapsed,
            ['Nav-Menu-dark']: isDarkTheme,
            ['Nav-Menu-light']: !isDarkTheme,
            ['Nav-Menu-disabled']: disabled || !!disabledItem, // 整体禁用或者菜单项有禁用 需要添加disabled样式 否则禁用菜单样式有问题
            ['Nav-Menu-expand-before']:
              stacked && mode === 'inline' && !collapsed && expandBefore
          })}
          direction={direction}
          // @ts-ignore
          // horizontal inline vertical-right
          mode={stacked && mode === 'inline' && !collapsed ? 'inline' : rcMode}
          inlineIndent={inlineIndent}
          triggerSubMenuAction={triggerSubMenuAction}
          expandIcon={this.renderExpandIcon}
          getPopupContainer={popOverContainer}
          overflowedIndicator={
            React.isValidElement(overflowedIndicator) ? (
              React.cloneElement(overflowedIndicator as React.ReactElement, {
                className: cx(
                  'Nav-Menu-item-icon Nav-Menu-overflowedIcon',
                  overflowedIndicator.props?.className
                )
              })
            ) : (
              <i
                className={cx(
                  'Nav-Menu-item-icon Nav-Menu-overflowedIcon',
                  'fa fa-ellipsis-h'
                )}
              />
            )
          }
          // RcMenu没有暴露这个属性 但实际可以覆盖
          // @ts-ignore
          maxCount={
            stacked || disabledOverflow
              ? Overflow.INVALIDATE
              : overflowMaxCount || Overflow.RESPONSIVE
          }
          component={overflowComponent || 'ul'}
          style={overflowStyle}
          overflowedIndicatorPopupClassName={overflowedIndicatorPopupClassName}
          suffix={overflowSuffix ? overflowSuffix : null}
          itemWidth={overflowItemWidth ? overflowItemWidth : null}
          selectedKeys={activeKey != null ? activeKey : []}
          defaultOpenKeys={defaultOpenKeys}
          openKeys={
            collapsed || !stacked || (stacked && mode === 'float')
              ? undefined
              : openKeys
          }
          onClick={this.handleItemClick}
        >
          {this.renderMenuContent(navigations)}
        </RcMenu>
      </MenuContext.Provider>
    );
  }
}

export default themeable(Menu);
